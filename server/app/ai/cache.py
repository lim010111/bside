"""Caching of per-pair evaluations.

The cached unit is one directed (viewer -> candidate) evaluation, so a BLE
re-observation of the same person reuses the same entry and a changing set of
nearby candidates does not invalidate everyone. Cache identity covers both
input revisions *and* the content hashes of the supplied text, the direction,
and the model/base URL/prompt/policy/inference configuration. Rotating BLE
tokens are deliberately not part of the key: they identify an advertisement,
not a person, and would evaluate the same person twice.

A cache hit is not authorisation. The server still rechecks revisions,
participation and observation validity before showing or notifying anything.
"""

import hashlib
import json
from typing import Protocol, runtime_checkable

from app.ai.models import CandidateRecommendation, ParticipantProfile


def _hash(*parts: str) -> str:
    digest = hashlib.sha256()
    for part in parts:
        digest.update(part.encode("utf-8"))
        digest.update(b"\x1f")
    return digest.hexdigest()


def participant_payload_hash(participant: ParticipantProfile) -> str:
    """Content hash of the text we would send for this participant."""
    return _hash(participant.self_description, participant.connection_intent)[:16]


def build_cache_key(
    *,
    namespace: str,
    viewer: ParticipantProfile,
    candidate: ParticipantProfile,
    inference_digest: str,
) -> str:
    """Identity of one directed evaluation under one configuration."""
    body = _hash(
        viewer.user_id,
        str(viewer.profile_revision),
        participant_payload_hash(viewer),
        candidate.user_id,
        str(candidate.profile_revision),
        participant_payload_hash(candidate),
        inference_digest,
    )[:32]
    # The direction stays readable in the key so operators can see the pair.
    return f"{namespace}:{viewer.user_id}->{candidate.user_id}:{body}"


def build_inference_digest(
    *,
    model: str | None,
    base_url: str | None,
    prompt_digest: str,
    policy_version: str,
    temperature: float,
    max_output_tokens: int,
    max_field_chars: int,
    batch_size: int,
    min_excerpt_chars: int,
) -> str:
    """Digest of everything that can change an evaluation's meaning.

    ``batch_size`` is included because it changes how candidates are grouped;
    the prompt asks for batch-independent absolute scores, but until that is
    measured on a real model we do not let two batch sizes share entries.

    The notification threshold is deliberately NOT part of the identity: it
    does not change the evaluation, and eligibility is recomputed from the
    policy in force on every read, including on a cache hit. Bump
    ``policy_version`` when the meaning of an evaluation changes.
    """
    payload = json.dumps(
        {
            "model": model,
            "base_url": base_url,
            "prompt": prompt_digest,
            "policy": policy_version,
            "temperature": temperature,
            "max_output_tokens": max_output_tokens,
            "max_field_chars": max_field_chars,
            "batch_size": batch_size,
            "min_excerpt_chars": min_excerpt_chars,
        },
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


@runtime_checkable
class RecommendationCache(Protocol):
    """Injectable store for directed evaluations."""

    async def get(self, key: str) -> CandidateRecommendation | None: ...

    async def set(
        self, key: str, value: CandidateRecommendation, ttl_seconds: int
    ) -> None: ...


class NullRecommendationCache:
    """Stores nothing. The default when no cache is injected."""

    async def get(self, key: str) -> CandidateRecommendation | None:
        return None

    async def set(
        self, key: str, value: CandidateRecommendation, ttl_seconds: int
    ) -> None:
        return None


class InMemoryRecommendationCache:
    """Process-local cache for tests and single-worker development."""

    def __init__(self) -> None:
        self._entries: dict[str, CandidateRecommendation] = {}

    async def get(self, key: str) -> CandidateRecommendation | None:
        return self._entries.get(key)

    async def set(
        self, key: str, value: CandidateRecommendation, ttl_seconds: int
    ) -> None:
        self._entries[key] = value

    def clear(self) -> None:
        self._entries.clear()

    def __len__(self) -> int:
        return len(self._entries)


class RedisRecommendationCache:
    """Adapter over the application's existing ``redis.asyncio`` client.

    Redis problems degrade to a miss: a cache outage must not turn into a
    recommendation failure, and no LLM call happens inside a Redis transaction.
    """

    def __init__(self, redis, *, on_error=None) -> None:
        self._redis = redis
        self._on_error = on_error

    async def get(self, key: str) -> CandidateRecommendation | None:
        try:
            raw = await self._redis.get(key)
        except Exception as error:  # noqa: BLE001 - any client error is a miss
            self._report(error)
            return None
        if raw is None:
            return None
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        try:
            return CandidateRecommendation.model_validate_json(raw)
        except Exception as error:  # noqa: BLE001 - stale/foreign shape is a miss
            self._report(error)
            return None

    async def set(
        self, key: str, value: CandidateRecommendation, ttl_seconds: int
    ) -> None:
        try:
            await self._redis.set(key, value.model_dump_json(), ex=ttl_seconds)
        except Exception as error:  # noqa: BLE001 - failing to cache is not fatal
            self._report(error)

    def _report(self, error: Exception) -> None:
        if self._on_error is not None:
            self._on_error(error)
