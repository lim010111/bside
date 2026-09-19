"""Asynchronous recommendation service.

Independent of the HTTP layer: it takes a viewer plus the candidates the server
already authorised, and returns one entry for every one of them. It never adds,
removes or renames a candidate, and never rewrites a supplied profile revision.

Failures stay visible. A missing key, a provider error, a timeout, malformed
JSON, an off-schema entry, a duplicated or unknown candidate id each produce a
distinguishable ``FAILED`` entry instead of an invented recommendation.
"""

import asyncio
import logging
import time
from datetime import UTC, datetime
from typing import Self

import pydantic

from app.ai.cache import (
    NullRecommendationCache,
    RecommendationCache,
    build_cache_key,
    build_inference_digest,
)
from app.ai.errors import (
    AIConfigurationError,
    AIGatewayError,
    AIGatewayHTTPError,
    AIResponseError,
    AIResponseTruncatedError,
    AITimeoutError,
)
from app.ai.gateway import (
    ChatGateway,
    OpenAICompatibleGateway,
    collect_metrics,
    parse_json_object,
)
from app.ai.grounding import verify_excerpts
from app.ai.models import (
    CandidateRecommendation,
    EvaluationStatus,
    FailureCode,
    GroundingExcerpt,
    ParticipantProfile,
    RecommendationRequest,
    RecommendationResult,
    TokenUsage,
)
from app.ai.policy import NotificationPolicy
from app.ai.prompt import DefaultPromptProvider, PromptProvider
from app.ai.schema import RawEvaluation, parse_evaluation
from app.ai.settings import AISettings

logger = logging.getLogger("app.ai")

_STATUS_ORDER = {
    EvaluationStatus.EVALUATED: 0,
    EvaluationStatus.INSUFFICIENT_EVIDENCE: 1,
    EvaluationStatus.PENDING: 2,
    EvaluationStatus.FAILED: 3,
}


def _chunk(
    items: tuple[ParticipantProfile, ...], size: int
) -> list[tuple[ParticipantProfile, ...]]:
    return [items[index : index + size] for index in range(0, len(items), size)]


def _placeholder(
    viewer: ParticipantProfile,
    candidate: ParticipantProfile,
    status: EvaluationStatus,
    failure_code: FailureCode | None = None,
) -> CandidateRecommendation:
    return CandidateRecommendation(
        candidate_user_id=candidate.user_id,
        status=status,
        rank=0,
        failure_code=failure_code,
        viewer_profile_revision=viewer.profile_revision,
        candidate_profile_revision=candidate.profile_revision,
    )


def pending_result(
    request: RecommendationRequest, *, policy_version: str | None = None
) -> RecommendationResult:
    """Build a full ``PENDING`` result without any provider or cache access.

    The nearby list must appear immediately, so the API layer can render this
    synchronously and schedule ``recommend()`` separately. Pending is not a low
    score and not a failure.
    """
    settings_version = policy_version or AISettings().policy_version
    items = tuple(
        _placeholder(request.viewer, candidate, EvaluationStatus.PENDING).model_copy(
            update={"rank": index}
        )
        for index, candidate in enumerate(request.candidates)
    )
    return RecommendationResult(
        viewer_user_id=request.viewer.user_id,
        viewer_profile_revision=request.viewer.profile_revision,
        recommendations=items,
        policy_version=settings_version,
    )


def stale_candidate_ids(
    result: RecommendationResult, request: RecommendationRequest
) -> tuple[str, ...]:
    """Ids whose evaluation no longer matches the current input snapshot.

    Covers a changed viewer revision (every entry goes stale), a changed
    candidate revision, a candidate with no entry, and an entry for someone who
    is no longer a candidate.
    """
    if result.viewer_user_id != request.viewer.user_id:
        # Both sides: a result for someone else is stale for every candidate it
        # names, even when the current request carries no candidates at all.
        return tuple(
            sorted(
                {candidate.user_id for candidate in request.candidates}
                | {entry.candidate_user_id for entry in result.recommendations}
            )
        )
    viewer_changed = result.viewer_profile_revision != request.viewer.profile_revision
    stale: set[str] = set()
    for candidate in request.candidates:
        entry = result.by_candidate_id(candidate.user_id)
        if entry is None or (
            viewer_changed
            or entry.candidate_profile_revision != candidate.profile_revision
        ):
            stale.add(candidate.user_id)
    current = {candidate.user_id for candidate in request.candidates}
    for entry in result.recommendations:
        if entry.candidate_user_id not in current:
            stale.add(entry.candidate_user_id)
    return tuple(sorted(stale))


def matches_current_inputs(
    result: RecommendationResult, request: RecommendationRequest
) -> bool:
    """Whether every entry still corresponds to the current input snapshot.

    This is a helper, not the gate. Before publishing or notifying, the server
    MUST atomically recheck profile/discovery revisions, current discovery
    participation, observation validity and notification de-duplication.
    """
    return not stale_candidate_ids(result, request)


def _usage(metrics, provider_calls: int) -> TokenUsage:
    """Turn this call's collected metrics into the public usage record.

    A zero is a measurement: the provider reported zero, or no provider request
    was made at all. A field the provider never reported stays ``None`` rather
    than becoming a fabricated zero, and ``complete`` says the record is partial.
    """
    if provider_calls == 0 and metrics.reported_usage == 0:
        return TokenUsage.nothing_sent()
    return TokenUsage(
        input_tokens=metrics.input_tokens,
        output_tokens=metrics.output_tokens,
        total_tokens=metrics.total_tokens,
        # Every field reported by every request that was made. Checked per
        # field: one response carrying only some counts leaves the others
        # summed over fewer requests, which is present but partial.
        complete=metrics.covers(provider_calls),
        reported_calls=metrics.reported_usage,
        provider_calls=provider_calls,
    )


class RecommendationService:
    """Evaluates authorised candidates for one viewer at a time."""

    def __init__(
        self,
        settings: AISettings | None = None,
        *,
        gateway: ChatGateway | None = None,
        cache: RecommendationCache | None = None,
        prompt: PromptProvider | None = None,
        policy: NotificationPolicy | None = None,
    ) -> None:
        self._settings = settings or AISettings()
        # ``is None`` rather than ``or``: an injected cache may be falsy when
        # it is empty, and silently swapping it for a null cache would hide it.
        self._prompt = DefaultPromptProvider() if prompt is None else prompt
        self._cache = NullRecommendationCache() if cache is None else cache
        self._policy = policy or NotificationPolicy(
            version=self._settings.policy_version,
            score_threshold=self._settings.notification_score_threshold,
            require_mutual_evidence=self._settings.notification_require_mutual_evidence,
            require_intent_evidence=self._settings.notification_require_intent_evidence,
            max_per_request=self._settings.notification_max_per_request,
        )
        self._owns_gateway = gateway is None
        self._gateway = (
            OpenAICompatibleGateway(self._settings) if gateway is None else gateway
        )
        self._semaphore = asyncio.Semaphore(self._settings.max_concurrent_requests)

    @property
    def settings(self) -> AISettings:
        return self._settings

    @property
    def policy(self) -> NotificationPolicy:
        return self._policy

    @property
    def inference_digest(self) -> str:
        settings = self._settings
        return build_inference_digest(
            model=settings.model,
            base_url=settings.base_url,
            prompt_digest=self._prompt.digest,
            policy_version=self._policy.version,
            temperature=settings.temperature,
            max_output_tokens=settings.max_output_tokens,
            max_field_chars=settings.max_field_chars,
            batch_size=settings.effective_batch_size(),
            min_excerpt_chars=settings.min_excerpt_chars,
        )

    def _oversized_fields(self, participant: ParticipantProfile) -> tuple[str, ...]:
        limit = self._settings.max_field_chars
        return tuple(
            name
            for name in ("self_description", "connection_intent")
            if len(getattr(participant, name)) > limit
        )

    def configuration_error(self) -> FailureCode | None:
        """``CONFIGURATION_MISSING`` when no provider call is possible."""
        if self._settings.missing_configuration():
            return FailureCode.CONFIGURATION_MISSING
        return None

    def require_configuration(self) -> None:
        """Raise if no provider call is possible. For startup checks.

        ``recommend()`` deliberately does not raise: it reports the missing
        configuration per candidate so the list survives. Call this at startup
        when you would rather fail loudly. Only names are reported, never values.
        """
        missing = self._settings.missing_configuration()
        if missing:
            raise AIConfigurationError(
                "missing AI configuration: " + ", ".join(missing)
            )

    async def aclose(self) -> None:
        if self._owns_gateway:
            await self._gateway.aclose()

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *_exc_info) -> None:
        await self.aclose()

    async def recommend(
        self, request: RecommendationRequest
    ) -> RecommendationResult:
        started = time.perf_counter()
        anomalies: list[str] = []
        resolved: dict[str, CandidateRecommendation] = {}

        missing = self._settings.missing_configuration()
        if missing:
            # Names only; values are never read here and never logged.
            logger.warning("ai gateway not configured: missing %s", ", ".join(missing))
            anomalies.append("configuration_missing:" + ",".join(missing))
            for candidate in request.candidates:
                resolved[candidate.user_id] = _placeholder(
                    request.viewer,
                    candidate,
                    EvaluationStatus.FAILED,
                    FailureCode.CONFIGURATION_MISSING,
                )
            return self._finalise(
                request, resolved, anomalies, started, 0, 0, TokenUsage.nothing_sent()
            )

        oversized = self._oversized_fields(request.viewer)
        if oversized:
            anomalies.append("viewer_input_too_long:" + ",".join(oversized))
            for candidate in request.candidates:
                resolved[candidate.user_id] = _placeholder(
                    request.viewer,
                    candidate,
                    EvaluationStatus.FAILED,
                    FailureCode.INPUT_TOO_LONG,
                )
            return self._finalise(
                request, resolved, anomalies, started, 0, 0, TokenUsage.nothing_sent()
            )

        digest = self.inference_digest
        # One deadline for the whole request. It is taken before the first
        # cache read, because a slow cache spends the caller's time exactly as
        # a slow provider does.
        deadline = asyncio.get_running_loop().time() + (
            self._settings.total_timeout_seconds
        )

        lookups: list[ParticipantProfile] = []
        for candidate in request.candidates:
            too_long = self._oversized_fields(candidate)
            if too_long:
                # Never truncate: a qualifier or a negation past the cut would
                # turn into a confident recommendation the input did not make.
                anomalies.append(
                    f"candidate_input_too_long:{candidate.user_id}:"
                    + ",".join(too_long)
                )
                resolved[candidate.user_id] = _placeholder(
                    request.viewer,
                    candidate,
                    EvaluationStatus.FAILED,
                    FailureCode.INPUT_TOO_LONG,
                )
                continue
            lookups.append(candidate)

        # Scoped to this call. The batch tasks started below inherit this
        # context, so two concurrent recommend() calls on one shared service
        # and one shared client never count each other's provider requests.
        with collect_metrics() as metrics:
            cache_hits, pending, expired = await self._load_cached(
                request, tuple(lookups), digest, resolved, anomalies, deadline
            )
            if pending:
                expired = (
                    await self._run_batches(
                        request, pending, digest, resolved, anomalies, deadline
                    )
                    or expired
                )
        if expired and "total_timeout" not in anomalies:
            anomalies.append("total_timeout")
        for candidate in request.candidates:
            if candidate.user_id not in resolved:
                resolved[candidate.user_id] = _placeholder(
                    request.viewer,
                    candidate,
                    EvaluationStatus.FAILED,
                    FailureCode.GATEWAY_TIMEOUT,
                )
        gateway_calls = self._gateway_calls(metrics, len(pending))
        return self._finalise(
            request,
            resolved,
            anomalies,
            started,
            cache_hits,
            gateway_calls,
            _usage(metrics, gateway_calls),
        )

    def _gateway_calls(self, attempts, pending: int) -> int:
        """Provider requests this call cost, retries and failures included.

        A gateway that reports its own attempts is believed even when it made
        none, which is what a cancelled or deadline-expired request should say.
        Otherwise the batch count is the best available estimate, and it misses
        retries by construction.
        """
        if getattr(self._gateway, "reports_attempts", False):
            return attempts.count
        if pending == 0:
            return 0
        return len(_chunk(tuple(range(pending)), self._settings.effective_batch_size()))

    async def _load_cached(
        self,
        request: RecommendationRequest,
        lookups: tuple[ParticipantProfile, ...],
        digest: str,
        resolved: dict[str, CandidateRecommendation],
        anomalies: list[str],
        deadline: float,
    ) -> tuple[int, tuple[ParticipantProfile, ...], bool]:
        if not lookups:
            return 0, (), False
        keys = [
            build_cache_key(
                namespace=self._settings.cache_namespace,
                viewer=request.viewer,
                candidate=candidate,
                inference_digest=digest,
            )
            for candidate in lookups
        ]
        tasks = [asyncio.create_task(self._cache.get(key)) for key in keys]
        expired = False
        try:
            async with asyncio.timeout_at(deadline):
                await asyncio.gather(*tasks, return_exceptions=True)
        except TimeoutError:
            expired = True
        except BaseException:
            await self._cancel(tasks)
            raise
        if expired:
            await self._cancel(tasks)

        cache_hits = 0
        pending: list[ParticipantProfile] = []
        for candidate, task in zip(lookups, tasks, strict=True):
            cached = None
            if task.done() and not task.cancelled():
                error = task.exception()
                if error is None:
                    cached = task.result()
                else:
                    # A cache outage is a miss, never a failed recommendation.
                    anomalies.append(f"cache_read_failed:{type(error).__name__}")
            usable = self._revalidate_cached(
                cached, request.viewer, candidate, anomalies
            )
            if usable is None:
                pending.append(candidate)
            else:
                resolved[candidate.user_id] = usable
                cache_hits += 1
        return cache_hits, tuple(pending), expired

    def _revalidate_cached(
        self,
        cached: CandidateRecommendation | None,
        viewer: ParticipantProfile,
        candidate: ParticipantProfile,
        anomalies: list[str],
    ) -> CandidateRecommendation | None:
        """Re-check a stored entry against the live text before reusing it.

        Nothing stored is taken on trust. ``verified`` is recomputed against the
        profiles in this request, the revisions are re-stamped from the live
        snapshot, and rank/eligibility are cleared so the current policy decides.
        An entry that no longer grounds itself becomes a failure rather than a
        recommendation, exactly as a fresh one would.
        """
        if cached is None:
            return None
        if cached.candidate_user_id != candidate.user_id:
            anomalies.append(f"cache_entry_candidate_mismatch:{candidate.user_id}")
            return None
        if (
            cached.viewer_profile_revision != viewer.profile_revision
            or cached.candidate_profile_revision != candidate.profile_revision
        ):
            # The key binds both revisions, so this entry is corrupt rather
            # than merely old. It is reported and never mixed into the result.
            anomalies.append(f"cache_entry_revision_mismatch:{candidate.user_id}")
        excerpts = verify_excerpts(
            cached.excerpts, viewer, candidate, self._settings.min_excerpt_chars
        )
        base = {
            "excerpts": excerpts,
            "rank": 0,
            "notification_eligible": False,
            "from_cache": True,
            "viewer_profile_revision": viewer.profile_revision,
            "candidate_profile_revision": candidate.profile_revision,
        }
        if cached.status is EvaluationStatus.EVALUATED and not any(
            excerpt.verified for excerpt in excerpts
        ):
            anomalies.append(f"ungrounded_reason:{candidate.user_id}")
            return cached.model_copy(
                update=base
                | {
                    "status": EvaluationStatus.FAILED,
                    "failure_code": FailureCode.UNGROUNDED_REASON,
                    "score": None,
                    "reason": None,
                }
            )
        if any(not excerpt.verified for excerpt in excerpts):
            anomalies.append(f"unverified_excerpt:{candidate.user_id}")
        return cached.model_copy(update=base)

    async def _run_batches(
        self,
        request: RecommendationRequest,
        pending: tuple[ParticipantProfile, ...],
        digest: str,
        resolved: dict[str, CandidateRecommendation],
        anomalies: list[str],
        deadline: float,
    ) -> bool:
        size = self._settings.effective_batch_size()
        if size < self._settings.batch_size:
            # A batch whose answer cannot fit the output budget comes back
            # truncated, which loses every candidate in it.
            anomalies.append(f"batch_size_reduced:{size}")
        batches = _chunk(pending, size)

        async def run(batch: tuple[ParticipantProfile, ...]):
            # The semaphore is taken inside the task so the overall deadline
            # also bounds batches still queued behind the concurrency limit.
            queued_at = time.perf_counter()
            async with self._semaphore:
                started_at = time.perf_counter()
                try:
                    return await self._evaluate_batch(request, batch, digest, anomalies)
                finally:
                    logger.info(
                        "ai batch candidates=%d queue_ms=%.1f processing_ms=%.1f",
                        len(batch), (started_at - queued_at) * 1000,
                        (time.perf_counter() - started_at) * 1000,
                    )

        tasks = [asyncio.create_task(run(batch)) for batch in batches]
        timed_out = False
        try:
            async with asyncio.timeout_at(deadline):
                await asyncio.gather(*tasks, return_exceptions=True)
        except TimeoutError:
            timed_out = True
        except BaseException:
            # Includes cancellation of the caller: never leave tasks running.
            await self._cancel(tasks)
            raise
        if timed_out:
            await self._cancel(tasks)

        for batch, task in zip(batches, tasks, strict=True):
            outcome = None
            if task.done() and not task.cancelled():
                error = task.exception()
                if error is None:
                    outcome = task.result()
                else:  # pragma: no cover - batches handle their own errors
                    anomalies.append(f"batch_error:{type(error).__name__}")
            if outcome is None:
                code = (
                    FailureCode.GATEWAY_TIMEOUT if timed_out else FailureCode.CANCELLED
                )
                for candidate in batch:
                    resolved[candidate.user_id] = _placeholder(
                        request.viewer, candidate, EvaluationStatus.FAILED, code
                    )
                continue
            resolved.update(outcome)
        return timed_out

    @staticmethod
    async def _cancel(tasks: list[asyncio.Task]) -> None:
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    async def _evaluate_batch(
        self,
        request: RecommendationRequest,
        batch: tuple[ParticipantProfile, ...],
        digest: str,
        anomalies: list[str],
    ) -> dict[str, CandidateRecommendation]:
        viewer = request.viewer
        try:
            content = await self._gateway.complete(
                system=self._prompt.system_instructions(),
                user=self._prompt.render_user_payload(viewer, batch),
            )
            payload = parse_json_object(content)
        except asyncio.CancelledError:
            raise
        except AITimeoutError:
            return self._fail_batch(viewer, batch, FailureCode.GATEWAY_TIMEOUT)
        except AIGatewayError as error:
            # An error status the provider actually sent, versus never reaching
            # it at all. Read from the exception, never from its message.
            code = (
                FailureCode.GATEWAY_HTTP_ERROR
                if isinstance(error, AIGatewayHTTPError)
                or getattr(error, "status_code", None) is not None
                else FailureCode.GATEWAY_NETWORK_ERROR
            )
            return self._fail_batch(viewer, batch, code)
        except AIResponseTruncatedError:
            # Distinct from malformed JSON: the answer was cut short, so the
            # fix is output budget or batch size, not the prompt.
            anomalies.append(f"output_truncated:{len(batch)}")
            return self._fail_batch(viewer, batch, FailureCode.OUTPUT_TRUNCATED)
        except AIResponseError:
            return self._fail_batch(viewer, batch, FailureCode.INVALID_JSON)

        entries = payload.get("recommendations")
        if not isinstance(entries, list):
            anomalies.append("missing_recommendations_array")
            return self._fail_batch(viewer, batch, FailureCode.SCHEMA_MISMATCH)

        expected = {candidate.user_id: candidate for candidate in batch}
        results: dict[str, CandidateRecommendation] = {}
        duplicated: set[str] = set()
        for raw in entries:
            try:
                evaluation = parse_evaluation(raw)
            except pydantic.ValidationError:
                # The entry is unusable, but its id usually still is, and the
                # candidate deserves "the model answered badly" rather than
                # "the model never mentioned you".
                raw_id = raw.get("id", raw.get("candidate_id")) if isinstance(raw, dict) else None
                if isinstance(raw_id, str) and raw_id in expected:
                    if raw_id in results:
                        duplicated.add(raw_id)
                        anomalies.append(f"duplicate_candidate_id:{raw_id}")
                    else:
                        anomalies.append(f"schema_mismatch_entry:{raw_id}")
                        results[raw_id] = _placeholder(
                            viewer,
                            expected[raw_id],
                            EvaluationStatus.FAILED,
                            FailureCode.SCHEMA_MISMATCH,
                        )
                else:
                    anomalies.append("schema_mismatch_entry")
                continue
            candidate = expected.get(evaluation.candidate_id)
            if candidate is None:
                # The model may not introduce a participant the server did not
                # authorise, so the entry is dropped and recorded.
                anomalies.append(f"unknown_candidate_id:{evaluation.candidate_id}")
                continue
            if evaluation.candidate_id in results:
                duplicated.add(evaluation.candidate_id)
                anomalies.append(f"duplicate_candidate_id:{evaluation.candidate_id}")
                continue
            results[evaluation.candidate_id] = self._build(viewer, candidate, evaluation, anomalies)

        for user_id in duplicated:
            results[user_id] = _placeholder(
                viewer,
                expected[user_id],
                EvaluationStatus.FAILED,
                FailureCode.DUPLICATE_IN_RESPONSE,
            )
        for user_id, candidate in expected.items():
            if user_id not in results:
                anomalies.append(f"missing_in_response:{user_id}")
                results[user_id] = _placeholder(
                    viewer,
                    candidate,
                    EvaluationStatus.FAILED,
                    FailureCode.MISSING_IN_RESPONSE,
                )

        await self._store(viewer, expected, results, digest, anomalies)
        return results

    def _build(
        self,
        viewer: ParticipantProfile,
        candidate: ParticipantProfile,
        evaluation: RawEvaluation,
        anomalies: list[str],
    ) -> CandidateRecommendation:
        excerpts = verify_excerpts(
            tuple(
                GroundingExcerpt(source=item.source, quote=item.quote, verified=False)
                for item in evaluation.evidence
            ),
            viewer,
            candidate,
            self._settings.min_excerpt_chars,
        )
        status_text = (evaluation.status or "").strip().lower()
        if status_text == EvaluationStatus.INSUFFICIENT_EVIDENCE.value:
            return CandidateRecommendation(
                candidate_user_id=candidate.user_id,
                status=EvaluationStatus.INSUFFICIENT_EVIDENCE,
                rank=0,
                excerpts=excerpts,
                intent_conflict=evaluation.intent_conflict,
                viewer_profile_revision=viewer.profile_revision,
                candidate_profile_revision=candidate.profile_revision,
            )
        if status_text != EvaluationStatus.EVALUATED.value:
            anomalies.append(f"unknown_status:{candidate.user_id}")
            return _placeholder(
                viewer, candidate, EvaluationStatus.FAILED, FailureCode.SCHEMA_MISMATCH
            )

        reason = (evaluation.reason or "").strip()
        score = evaluation.score
        if not reason or score is None or not 0.0 <= score <= 1.0:
            anomalies.append(f"incomplete_evaluation:{candidate.user_id}")
            return _placeholder(
                viewer, candidate, EvaluationStatus.FAILED, FailureCode.SCHEMA_MISMATCH
            )
        if len(reason) > self._settings.max_reason_chars:
            # Kept verbatim: trimming would leave a mangled Korean sentence.
            anomalies.append(f"long_reason:{candidate.user_id}")
        if not any(excerpt.verified for excerpt in excerpts):
            # An evaluated claim with nothing we could find in the original text
            # is a provider grounding failure, not a thin input from the user,
            # so it is not relabelled as INSUFFICIENT_EVIDENCE. The candidate is
            # preserved and the unverified excerpts are kept for auditing, but
            # the score and the reason are withheld rather than shown.
            anomalies.append(f"ungrounded_reason:{candidate.user_id}")
            return CandidateRecommendation(
                candidate_user_id=candidate.user_id,
                status=EvaluationStatus.FAILED,
                rank=0,
                excerpts=excerpts,
                intent_conflict=evaluation.intent_conflict,
                failure_code=FailureCode.UNGROUNDED_REASON,
                viewer_profile_revision=viewer.profile_revision,
                candidate_profile_revision=candidate.profile_revision,
            )
        if any(not excerpt.verified for excerpt in excerpts):
            anomalies.append(f"unverified_excerpt:{candidate.user_id}")
        return CandidateRecommendation(
            candidate_user_id=candidate.user_id,
            status=EvaluationStatus.EVALUATED,
            rank=0,
            score=score,
            reason=reason,
            excerpts=excerpts,
            intent_conflict=evaluation.intent_conflict,
            viewer_profile_revision=viewer.profile_revision,
            candidate_profile_revision=candidate.profile_revision,
        )

    @staticmethod
    def _fail_batch(
        viewer: ParticipantProfile,
        batch: tuple[ParticipantProfile, ...],
        code: FailureCode,
    ) -> dict[str, CandidateRecommendation]:
        return {
            candidate.user_id: _placeholder(
                viewer, candidate, EvaluationStatus.FAILED, code
            )
            for candidate in batch
        }

    async def _store(
        self,
        viewer: ParticipantProfile,
        expected: dict[str, ParticipantProfile],
        results: dict[str, CandidateRecommendation],
        digest: str,
        anomalies: list[str],
    ) -> None:
        # Only reusable outcomes are cached. Failures are transient by nature
        # and caching them would hide a recovered provider.
        for user_id, item in results.items():
            if item.status is EvaluationStatus.FAILED:
                continue
            key = build_cache_key(
                namespace=self._settings.cache_namespace,
                viewer=viewer,
                candidate=expected[user_id],
                inference_digest=digest,
            )
            try:
                await self._cache.set(
                    key,
                    item.model_copy(update={"rank": 0, "notification_eligible": False}),
                    self._settings.cache_ttl_seconds,
                )
            except asyncio.CancelledError:
                raise
            except Exception as error:  # noqa: BLE001 - never lose a paid-for batch
                # Failing to store an evaluation must not discard it. An
                # injected cache that raises is a cache outage, not a bad
                # recommendation.
                anomalies.append(f"cache_write_failed:{type(error).__name__}")

    def _finalise(
        self,
        request: RecommendationRequest,
        resolved: dict[str, CandidateRecommendation],
        anomalies: list[str],
        started: float,
        cache_hits: int,
        gateway_calls: int,
        usage: TokenUsage,
    ) -> RecommendationResult:
        order = {
            candidate.user_id: index
            for index, candidate in enumerate(request.candidates)
        }

        def sort_key(item: CandidateRecommendation):
            # Deterministic: status class, then score, then the order the
            # server supplied the candidates in.
            return (
                _STATUS_ORDER[item.status],
                -(item.score if item.score is not None else 0.0),
                order[item.candidate_user_id],
            )

        ordered = sorted(
            (
                resolved.get(candidate.user_id)
                or _placeholder(request.viewer, candidate, EvaluationStatus.PENDING)
                for candidate in request.candidates
            ),
            key=sort_key,
        )
        ranked = tuple(
            item.model_copy(update={"rank": index}) for index, item in enumerate(ordered)
        )
        # Eligibility is recomputed here, so a cache hit is still judged by the
        # current threshold and policy rather than the one it was stored under.
        marked = self._policy.apply(ranked)
        return RecommendationResult(
            viewer_user_id=request.viewer.user_id,
            viewer_profile_revision=request.viewer.profile_revision,
            recommendations=marked,
            policy_version=self._policy.version,
            model=self._settings.model,
            prompt_digest=self._prompt.digest,
            inference_digest=self.inference_digest,
            generated_at=datetime.now(UTC),
            anomalies=tuple(anomalies),
            cache_hits=cache_hits,
            gateway_calls=gateway_calls,
            usage=usage,
            duration_ms=round((time.perf_counter() - started) * 1000, 3),
        )
