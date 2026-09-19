"""Bridge between the observation endpoint and ``app.ai``.

The AI module is deliberately independent of HTTP (server/docs/ai.md). This is
the API side of that boundary: it decides who may be evaluated, turns the
module's rich evaluation into the public response shape, and keeps the gateway
off the request path.

## Why the request never calls the gateway

An evaluation of 20 candidates took a median 8.878s on the selected model, and
four candidates took ~6.5s in a local check. `POST /discovery/observations` has
to return the nearby list immediately, so waiting for that is not an option.

So the request path reads the cache and nothing else. Anything missing comes
back as ``pending`` and is evaluated in the background; the client's next poll
finds it cached (~2ms). This is what the contract means by showing the list
first and updating recommendations when the evaluation finishes.

## Why the rank is computed here

``RecommendationService`` ranks within one ``recommend()`` call's candidate set
and deliberately stores every entry with ``rank=0``, because a position is only
meaningful against the group it was compared with. Entries read back one by one
therefore carry no usable order. The rank published here is recomputed over the
people this viewer can see in *this* response, using the same rule the service
uses internally: status class, then score, then the order the candidates were
supplied in.

## What is not exposed

Scores, excerpts, revisions and model identity stay server-side. The public
object is a status, that ordering rank and — only when the evaluation succeeded
— one or two sentences of reason.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import math
from typing import Any, NamedTuple
from uuid import uuid4

from app.ai import (
    AISettings,
    CandidateRecommendation,
    EvaluationStatus,
    FailureCode,
    ParticipantProfile,
    RecommendationCache,
    RecommendationRequest,
    RecommendationService,
    build_cache_key,
)

logger = logging.getLogger(__name__)

UNAVAILABLE: dict[str, Any] = {"status": "unavailable"}

# How the module's four states become the public ones. They are not
# interchangeable: 'unscored' means the evaluation ran and found no specific
# connection, which is not a failure and not a low score.
#
# The bridge caches failures briefly to prevent a fast refresh from creating a
# retry storm. The AI service itself still only caches successful evaluations.
_PUBLIC_STATUS = {
    EvaluationStatus.EVALUATED: "ready",
    EvaluationStatus.INSUFFICIENT_EVIDENCE: "unscored",
    EvaluationStatus.FAILED: "failed",
    EvaluationStatus.PENDING: "pending",
}

# Ordering between status classes, mirroring ``service._STATUS_ORDER``: someone
# with a reason first, then evaluated-but-unremarkable, then not-yet-evaluated.
_STATUS_RANK = {"ready": 0, "unscored": 1, "pending": 2, "failed": 3}


class _Entry(NamedTuple):
    """One candidate's outcome, before it is ordered against the others."""

    user_id: str
    status: str
    score: float | None
    reason: str | None
    position: int


def _ranked(entries: list[_Entry]) -> dict[str, dict[str, Any]]:
    """Order this response's candidates and turn each into its public object.

    The score decides the order but is never published: a number invites the
    reader to treat a guess as a measurement, while a position only claims that
    one person came out above another.
    """
    order = sorted(
        entries,
        key=lambda entry: (
            _STATUS_RANK.get(entry.status, len(_STATUS_RANK)),
            -(entry.score or 0.0),
            entry.position,
        ),
    )
    public: dict[str, dict[str, Any]] = {}
    for rank, entry in enumerate(order):
        item: dict[str, Any] = {"status": entry.status, "rank": rank}
        if entry.status == "ready" and entry.reason:
            item["reason"] = entry.reason
        public[entry.user_id] = item
    return public


def job_key(viewer: ParticipantProfile, inference_digest: str, candidate: ParticipantProfile) -> str:
    """One directed input snapshot, shared by overlapping batches and workers."""
    return build_cache_key(
        namespace="ai:job:v2", viewer=viewer, candidate=candidate,
        inference_digest=inference_digest,
    )


_RELEASE_JOB = """
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
end
return 0
"""


def _profile(user_id: str, profile: dict[str, str], revision: int) -> ParticipantProfile:
    return ParticipantProfile(
        user_id=user_id,
        self_description=profile["self_description"],
        connection_intent=profile["connection_intent"],
        profile_revision=revision,
    )


class Recommendations:
    """Serves cached evaluations and schedules the missing ones."""

    def __init__(
        self,
        service: RecommendationService | None,
        cache: RecommendationCache | None,
        *,
        settings: AISettings | None = None,
        redis=None,
        push=None,
        store=None,
        notice_ttl: int = 21600,
    ) -> None:
        self._service = service
        self._cache = cache
        self._settings = settings or (service.settings if service else AISettings())
        self._redis = redis
        self._push = push
        self._store = store
        self._notice_ttl = notice_ttl
        self._tasks: set[asyncio.Task[None]] = set()
        self._inflight: set[str] = set()

    @property
    def enabled(self) -> bool:
        """False when the gateway is unconfigured, so the API says so plainly."""
        return self._service is not None and self._cache is not None

    async def aclose(self) -> None:
        for task in list(self._tasks):
            task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)
        if self._service is not None:
            await self._service.aclose()

    async def annotate(
        self,
        viewer_id: str,
        viewer_profile: dict[str, str],
        viewer_revision: int,
        observed: list[dict[str, Any]],
    ) -> dict[str, dict[str, Any]]:
        """Recommendation object per observed user id. Cache reads only."""
        if not observed:
            return {}
        if not self.enabled:
            return {row["user_id"]: dict(UNAVAILABLE) for row in observed}

        viewer = _profile(viewer_id, viewer_profile, viewer_revision)
        candidates = tuple(
            _profile(row["user_id"], row["profile"], row["profile_revision"])
            for row in observed
        )

        digest = self._service.inference_digest
        keys = {
            candidate.user_id: build_cache_key(
                namespace=self._settings.cache_namespace,
                viewer=viewer,
                candidate=candidate,
                inference_digest=digest,
            )
            for candidate in candidates
        }
        found = await asyncio.gather(
            *(self._cache.get(keys[candidate.user_id]) for candidate in candidates),
            return_exceptions=True,
        )

        entries: list[_Entry] = []
        missing: list[ParticipantProfile] = []
        for position, (candidate, cached) in enumerate(zip(candidates, found, strict=True)):
            if isinstance(cached, BaseException):
                # A cache outage reads as "not evaluated yet", never as a failure.
                logger.warning("recommendation cache read failed: %s", cached)
                cached = None
            if cached is not None and cached.candidate_user_id != candidate.user_id:
                # An entry filed under this pair's key that names someone else
                # is corrupt. Discard it rather than attribute its reason.
                logger.warning(
                    "recommendation cache entry names %s under %s's key",
                    cached.candidate_user_id,
                    candidate.user_id,
                )
                cached = None
            if cached is None:
                entries.append(_Entry(candidate.user_id, "pending", None, None, position))
                missing.append(candidate)
                continue
            entries.append(
                _Entry(
                    candidate.user_id,
                    _PUBLIC_STATUS.get(cached.status, "pending"),
                    cached.score,
                    cached.reason,
                    position,
                )
            )

        if missing:
            self._schedule(viewer, tuple(missing))
        return _ranked(entries)

    def _schedule(self, viewer: ParticipantProfile, candidates: tuple[ParticipantProfile, ...]) -> None:
        task = asyncio.create_task(self._evaluate(viewer, candidates))
        # Hold a reference: a bare create_task can be garbage collected mid-flight.
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _evaluate(self, viewer: ParticipantProfile, candidates: tuple[ParticipantProfile, ...]) -> None:
        """Populate the cache. Runs off the request path; failures only log."""
        leases: dict[str, str] = {}
        try:
            claimed = await asyncio.gather(*(
                self._claim(viewer, candidate, leases) for candidate in candidates
            ))
            selected = tuple(candidate for candidate, owned in zip(candidates, claimed, strict=True) if owned)
            if not selected:
                return
            result = await self._service.recommend(
                RecommendationRequest(viewer=viewer, candidates=selected)
            )
            # Refreshes may arrive every second. Failures are visible and get a
            # short cooldown instead of repeatedly spending tokens on the pair.
            for entry in result.recommendations:
                if entry.status == EvaluationStatus.FAILED:
                    await self._cache_failure(viewer, next(c for c in selected if c.user_id == entry.candidate_user_id), entry)
            try:
                await self._notify(viewer, result)
            except Exception as error:  # noqa: BLE001 - notices cannot invalidate results
                logger.warning("recommendation notice failed: %s", error)
        except asyncio.CancelledError:
            raise
        except Exception as error:  # noqa: BLE001 - a failed evaluation is not a failed request
            logger.warning("background recommendation failed: %s", error)
            for candidate in candidates:
                if job_key(viewer, self._service.inference_digest, candidate) in leases:
                    await self._cache_failure(viewer, candidate)
        finally:
            await self._release(leases)

    async def _cache_failure(self, viewer, candidate, entry=None) -> None:
        entry = entry or CandidateRecommendation(
            candidate_user_id=candidate.user_id, status=EvaluationStatus.FAILED,
            rank=0, failure_code=FailureCode.GATEWAY_NETWORK_ERROR,
            viewer_profile_revision=viewer.profile_revision,
            candidate_profile_revision=candidate.profile_revision,
        )
        key = build_cache_key(
            namespace=self._settings.cache_namespace, viewer=viewer, candidate=candidate,
            inference_digest=self._service.inference_digest,
        )
        try:
            await self._cache.set(key, entry, 15)
        except Exception as error:  # noqa: BLE001
            logger.warning("recommendation failure cache unavailable: %s", error)

    async def _notify(self, viewer: ParticipantProfile, result) -> None:
        """Push about the candidates the policy judged worth interrupting for.

        The module decides *whether* a candidate clears the bar; this decides
        whether the person should be interrupted about them right now. Both
        users must still be participating, and one pair notifies once.
        """
        if self._push is None or not self._push.enabled or self._store is None:
            return
        current = await self._store.get_user(viewer.user_id)
        if (current.get("discovery_enabled") != "1"
                or self._store.revision_of(current) != viewer.profile_revision):
            return
        visible = {
            row["user_id"]: row for row in await self._store.observed_snapshots(
                viewer.user_id, list(result.notification_candidate_ids)
            )
        }
        for candidate_id in result.notification_candidate_ids:
            try:
                row = visible.get(candidate_id)
                entry = result.by_candidate_id(candidate_id)
                if row is None or row["profile_revision"] != entry.candidate_profile_revision:
                    continue
                key = f"push:told:{viewer.user_id}:{candidate_id}"
                if not await self._push.claim_once(key, self._notice_ttl):
                    continue
                self._push.recommendation(
                    self._store, viewer.user_id, candidate_id, row["profile"]["nickname"]
                )
            except asyncio.CancelledError:
                raise
            except Exception as error:  # noqa: BLE001
                logger.warning("recommendation notice failed: %s", error)

    async def _claim(self, viewer: ParticipantProfile, candidate: ParticipantProfile, leases: dict[str, str]) -> bool:
        """Claim a pair, including revisions, before waiting for the model."""
        key = job_key(viewer, self._service.inference_digest, candidate)
        if key in self._inflight:
            return False
        self._inflight.add(key)
        token = leases[key] = uuid4().hex
        if self._redis is None:
            return True
        ttl = math.ceil(self._settings.total_timeout_seconds) + 5
        try:
            if await self._redis.set(key, token, nx=True, ex=ttl):
                return True
            leases.pop(key, None)
            self._inflight.discard(key)
            return False
        except Exception as error:  # noqa: BLE001
            logger.warning("recommendation job lock unavailable: %s", error)
            return True

    async def _release(self, leases: dict[str, str]) -> None:
        async def release(key, token):
            try:
                if self._redis is not None:
                    # An expired lease may already belong to another worker.
                    await self._redis.eval(_RELEASE_JOB, 1, key, token)
            except Exception as error:  # noqa: BLE001
                logger.warning("recommendation job release unavailable: %s", error)
            finally:
                self._inflight.discard(key)
        await asyncio.gather(*(release(key, token) for key, token in leases.items()))


def build_recommendations(
    redis, *, settings: AISettings | None = None, push=None, settings_for_push=None
) -> Recommendations:
    """Wire the module against the application's Redis, or disable it cleanly."""
    settings = settings or AISettings()
    if settings.missing_configuration():
        logger.info(
            "AI recommendations disabled, missing: %s",
            ", ".join(settings.missing_configuration()),
        )
        return Recommendations(None, None, settings=settings)

    from app.ai import RedisRecommendationCache
    from app.store import Store

    cache = RedisRecommendationCache(
        redis, on_error=lambda error: logger.warning("recommendation cache: %s", error)
    )
    service = RecommendationService(settings, cache=cache)
    # A background evaluation has no request and so no Store from the usual
    # dependency; it reads the same Redis through its own.
    store = Store(redis, settings_for_push) if settings_for_push is not None else None
    return Recommendations(
        service,
        cache,
        settings=settings,
        redis=redis,
        push=push,
        store=store,
        notice_ttl=getattr(settings_for_push, "recommendation_notice_ttl_seconds", 21600),
    )


@contextlib.asynccontextmanager
async def recommendations_lifespan(redis, *, settings: AISettings | None = None):
    bridge = build_recommendations(redis, settings=settings)
    try:
        yield bridge
    finally:
        await bridge.aclose()
