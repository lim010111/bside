"""Independent review tests for ``app.ai`` (reviewer-owned; not the unit suite).

Written by the review Claude, separately from ``tests/test_ai.py`` and from the
acceptance/eval work. Nothing here calls a real model or the network.

Every test here is a plain passing test. Findings R1-R8 were reported as
``xfail`` while they were open; each one was independently re-verified as fixed
and its marker removed, so a regression now fails the suite outright rather
than being absorbed as an expected failure. The remaining tests pin invariants
that were verified correct from the start.

Test names keep their ``r<N>`` prefix so each one stays traceable to the
finding it came from in ``server/docs/ai-review.md``.

These tests exercise contract behaviour around a stubbed provider. Passing them
says nothing about recommendation quality.
"""

import asyncio
import json
import logging
import time

import httpx
import pytest

from app.ai import (
    AIInputError,
    AISettings,
    CandidateRecommendation,
    EvaluationStatus,
    ExcerptSource,
    FailureCode,
    GroundingExcerpt,
    InMemoryRecommendationCache,
    NullRecommendationCache,
    OpenAICompatibleGateway,
    ParticipantProfile,
    RecommendationRequest,
    RecommendationService,
    matches_current_inputs,
    stale_candidate_ids,
)
from app.ai.cache import build_cache_key

VIEWER = ParticipantProfile(
    user_id="viewer",
    self_description="배포 파이프라인을 직접 만들고 있습니다.",
    connection_intent="배포 권한 오류를 같이 봐줄 사람을 찾고 있어요.",
    profile_revision=3,
)
HELPER = ParticipantProfile(
    user_id="helper",
    self_description="인프라 엔지니어로 일했습니다.",
    connection_intent="배포 권한 오류를 자주 다뤄봤습니다.",
    profile_revision=2,
)


def settings(**overrides) -> AISettings:
    base = {"api_key": "review-key", "base_url": "http://gateway.invalid", "model": "m"}
    base.update(overrides)
    return AISettings(**base)


# Quotes copied verbatim out of VIEWER/HELPER (and out of ``candidates()``, which
# reuses HELPER's wording), so a well-formed stub answer is genuinely grounded.
# Kept real on purpose: the pending grounding-failure change must not silently
# reclassify these fixtures.
GROUNDED_EVIDENCE = [
    {"source": "viewer_connection_intent", "quote": "배포 권한 오류를 같이 봐줄 사람"},
    {"source": "candidate_connection_intent", "quote": "배포 권한 오류를 자주 다뤄봤습니다"},
    {"source": "viewer_self_description", "quote": "배포 파이프라인"},
    {"source": "candidate_self_description", "quote": "인프라 엔지니어"},
]


def _entry(candidate_id: str, **overrides) -> dict:
    entry = {
        "candidate_id": candidate_id,
        "status": "evaluated",
        "score": 0.9,
        "reason": "배포 권한 오류 경험이 서로 맞물립니다.",
        "intent_conflict": False,
        "evidence": list(GROUNDED_EVIDENCE),
    }
    entry.update(overrides)
    return entry


class StubGateway:
    """Answers with one entry per candidate id actually present in the batch."""

    def __init__(self, *, overrides: dict | None = None, delay: float = 0.0) -> None:
        self.overrides = overrides or {}
        self.delay = delay
        self.completions = 0

    async def complete(self, *, system: str, user: str) -> str:
        self.completions += 1
        if self.delay:
            await asyncio.sleep(self.delay)
        ids = [c["candidate_id"] for c in json.loads(user)["candidates"]]
        return json.dumps(
            {"recommendations": [_entry(i, **self.overrides) for i in ids]},
            ensure_ascii=False,
        )

    async def aclose(self) -> None:
        return None


class RawGateway:
    """Returns a fixed body regardless of the batch."""

    def __init__(self, body) -> None:
        self.body = body if isinstance(body, str) else json.dumps(body, ensure_ascii=False)

    async def complete(self, *, system: str, user: str) -> str:
        return self.body

    async def aclose(self) -> None:
        return None


def candidates(count: int) -> tuple[ParticipantProfile, ...]:
    return tuple(
        ParticipantProfile(
            user_id=f"c{index}",
            self_description="인프라 엔지니어로 일했습니다.",
            connection_intent="배포 권한 오류를 자주 다뤄봤습니다.",
            profile_revision=1,
        )
        for index in range(count)
    )


# --- R1: the overall deadline does not cover cache reads -----------------


class SlowGetCache:
    def __init__(self, delay: float) -> None:
        self.delay = delay

    async def get(self, key: str):
        await asyncio.sleep(self.delay)
        return None

    async def set(self, key, value, ttl_seconds) -> None:
        return None


async def test_r1_total_timeout_also_bounds_cache_reads():
    """``total_timeout_seconds`` is documented as bounding the whole request.

    Four sequential 0.5s cache reads take 2s under a 0.3s deadline; at the
    AI-D5 target of 20 nearby candidates this scales linearly with no ceiling.
    """
    config = settings(total_timeout_seconds=0.3, batch_size=2)
    service = RecommendationService(
        config, gateway=StubGateway(), cache=SlowGetCache(0.5)
    )
    request = RecommendationRequest(viewer=VIEWER, candidates=candidates(4))
    started = time.perf_counter()
    result = await service.recommend(request)
    elapsed = time.perf_counter() - started
    await service.aclose()

    assert len(result.recommendations) == 4
    assert elapsed < config.total_timeout_seconds * 3


# --- R2: a cache write failure destroys a paid-for batch -----------------


class RaisingSetCache:
    async def get(self, key: str):
        return None

    async def set(self, key, value, ttl_seconds) -> None:
        raise RuntimeError("cache backend unavailable")


async def test_r2_cache_write_failure_does_not_discard_evaluations():
    """A cache outage must degrade to a miss, not to FAILED recommendations."""
    gateway = StubGateway()
    service = RecommendationService(
        settings(batch_size=2), gateway=gateway, cache=RaisingSetCache()
    )
    request = RecommendationRequest(viewer=VIEWER, candidates=candidates(4))
    result = await service.recommend(request)
    await service.aclose()

    assert gateway.completions == 2
    statuses = {item.status for item in result.recommendations}
    assert statuses == {EvaluationStatus.EVALUATED}, [
        (i.candidate_user_id, i.status.value, i.failure_code) for i in result.recommendations
    ]


# --- R3: trivial quotes satisfy the whole notification gate --------------


async def test_r3_punctuation_excerpts_do_not_ground_a_notification():
    """AI-D4 asks for a conservative notification bar.

    Four ``"."`` excerpts are substrings of every profile, so both
    ``require_mutual_evidence`` and ``require_intent_evidence`` pass today.
    """
    trivial = [
        {"source": source.value, "quote": "."}
        for source in (
            ExcerptSource.VIEWER_CONNECTION_INTENT,
            ExcerptSource.CANDIDATE_CONNECTION_INTENT,
            ExcerptSource.VIEWER_SELF_DESCRIPTION,
            ExcerptSource.CANDIDATE_SELF_DESCRIPTION,
        )
    ]
    service = RecommendationService(
        settings(), gateway=StubGateway(overrides={"score": 0.95, "evidence": trivial})
    )
    result = await service.recommend(
        RecommendationRequest(viewer=VIEWER, candidates=(HELPER,))
    )
    await service.aclose()
    item = result.by_candidate_id("helper")

    # The candidate is still returned - a grounding failure is not a removal.
    assert item is not None
    assert all(excerpt.verified is False for excerpt in item.excerpts)
    assert item.notification_eligible is False
    # Withheld rather than shown, and reported as the provider's failure rather
    # than as a thin input from the participant.
    assert item.status is EvaluationStatus.FAILED
    assert item.failure_code is FailureCode.UNGROUNDED_REASON
    assert item.score is None and not item.reason


# --- R4: an off-schema entry is attributed as "missing" ------------------


@pytest.mark.parametrize(
    "override",
    [
        pytest.param({"score": "0.95"}, id="string-score"),
        pytest.param(
            {"evidence": [{"source": "candidate_nickname", "quote": "인프라"}]},
            id="unknown-evidence-source",
        ),
    ],
)
async def test_r4_off_schema_entry_is_distinguishable_from_a_missing_one(override):
    """``service`` promises a distinguishable FAILED entry per failure kind."""
    service = RecommendationService(
        settings(), gateway=RawGateway({"recommendations": [_entry("helper", **override)]})
    )
    result = await service.recommend(
        RecommendationRequest(viewer=VIEWER, candidates=(HELPER,))
    )
    await service.aclose()
    item = result.by_candidate_id("helper")

    assert item.status is EvaluationStatus.FAILED
    assert item.failure_code is FailureCode.SCHEMA_MISMATCH


# --- R5: the stale helper misses a foreign viewer with no candidates -----


async def test_r5_foreign_viewer_result_never_matches_current_inputs():
    service = RecommendationService(settings(), gateway=StubGateway())
    foreign = await service.recommend(
        RecommendationRequest(viewer=VIEWER, candidates=(HELPER,))
    )
    await service.aclose()

    other = ParticipantProfile(
        user_id="someone-else", self_description="", connection_intent="", profile_revision=0
    )
    empty_request = RecommendationRequest(viewer=other, candidates=())

    assert stale_candidate_ids(foreign, empty_request) == ("helper",)
    assert matches_current_inputs(foreign, empty_request) is False


# --- R6: cached entries are trusted for `verified` and for revisions -----


def _forged_entry() -> CandidateRecommendation:
    absent = "이 문장은 어느 프로필에도 없습니다"
    return CandidateRecommendation(
        candidate_user_id="helper",
        status=EvaluationStatus.EVALUATED,
        rank=0,
        score=0.99,
        reason="근거 없이 높은 점수",
        excerpts=tuple(
            GroundingExcerpt(source=source, quote=f"{absent} {source.value}", verified=True)
            for source in ExcerptSource
        ),
        viewer_profile_revision=1,
        candidate_profile_revision=1,
    )


async def _seed_forged_cache() -> tuple[RecommendationService, RecommendationRequest]:
    config = settings()
    cache = InMemoryRecommendationCache()
    service = RecommendationService(config, gateway=StubGateway(), cache=cache)
    key = build_cache_key(
        namespace=config.cache_namespace,
        viewer=VIEWER,
        candidate=HELPER,
        inference_digest=service.inference_digest,
    )
    await cache.set(key, _forged_entry(), config.cache_ttl_seconds)
    return service, RecommendationRequest(viewer=VIEWER, candidates=(HELPER,))


async def test_r6_cached_excerpts_are_reverified_against_live_text():
    service, request = await _seed_forged_cache()
    result = await service.recommend(request)
    await service.aclose()
    item = result.by_candidate_id("helper")

    assert result.cache_hits == 1
    assert all(excerpt.verified is False for excerpt in item.excerpts)
    assert item.notification_eligible is False


async def test_r6_cached_entry_with_foreign_revisions_is_not_reused():
    service, request = await _seed_forged_cache()
    result = await service.recommend(request)
    await service.aclose()
    item = result.by_candidate_id("helper")

    # A result must not mix its own viewer revision with an entry from another.
    assert item.viewer_profile_revision == result.viewer_profile_revision
    assert item.candidate_profile_revision == HELPER.profile_revision


# --- R7: gateway_calls is not the number of provider requests ------------


async def test_r7_gateway_calls_counts_provider_attempts():
    attempts = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        attempts["n"] += 1
        raise httpx.ConnectError("refused")

    config = settings(max_attempts=3)
    gateway = OpenAICompatibleGateway(config, transport=httpx.MockTransport(handler))
    service = RecommendationService(config, gateway=gateway)
    result = await service.recommend(
        RecommendationRequest(viewer=VIEWER, candidates=(HELPER,))
    )
    await gateway.aclose()
    await service.aclose()

    assert result.recommendations[0].failure_code is FailureCode.GATEWAY_NETWORK_ERROR
    assert result.gateway_calls == attempts["n"]


# --- R8: failure classification sniffs the exception message -------------


async def test_r8_transport_error_named_http_is_not_a_gateway_http_error():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.HTTPStatusError(
            "boom", request=request, response=httpx.Response(200, request=request)
        )

    config = settings()
    gateway = OpenAICompatibleGateway(config, transport=httpx.MockTransport(handler))
    service = RecommendationService(config, gateway=gateway)
    result = await service.recommend(
        RecommendationRequest(viewer=VIEWER, candidates=(HELPER,))
    )
    await gateway.aclose()
    await service.aclose()

    assert result.recommendations[0].failure_code is FailureCode.GATEWAY_NETWORK_ERROR


# --- verified-good invariants: these must keep passing -------------------


async def test_queued_batches_are_bounded_by_the_total_deadline():
    """Batches waiting behind ``max_concurrent_requests`` still hit the deadline."""
    config = settings(
        batch_size=2, max_concurrent_requests=1, total_timeout_seconds=1.0
    )
    service = RecommendationService(config, gateway=StubGateway(delay=0.6))
    started = time.perf_counter()
    result = await service.recommend(
        RecommendationRequest(viewer=VIEWER, candidates=candidates(8))
    )
    elapsed = time.perf_counter() - started
    await service.aclose()

    assert elapsed < config.total_timeout_seconds + 0.5
    assert len(result.recommendations) == 8
    assert "total_timeout" in result.anomalies
    by_id = {item.candidate_user_id: item for item in result.recommendations}
    assert by_id["c0"].status is EvaluationStatus.EVALUATED
    assert by_id["c7"].status is EvaluationStatus.FAILED
    assert by_id["c7"].failure_code is FailureCode.GATEWAY_TIMEOUT


async def test_caller_cancellation_leaves_no_running_batch():
    gateway = StubGateway(delay=5.0)
    service = RecommendationService(
        settings(batch_size=2, max_concurrent_requests=4, total_timeout_seconds=30),
        gateway=gateway,
    )
    before = asyncio.all_tasks()
    task = asyncio.create_task(
        service.recommend(RecommendationRequest(viewer=VIEWER, candidates=candidates(8)))
    )
    await asyncio.sleep(0.1)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    await asyncio.sleep(0.05)
    await service.aclose()

    assert asyncio.all_tasks() - before - {asyncio.current_task()} == set()
    assert gateway.completions == 4  # started, none allowed to finish


async def test_every_candidate_survives_a_partial_failure_with_dense_ranks():
    body = {
        "recommendations": [
            _entry("c0", score=0.9),
            _entry("c1", status="insufficient_evidence", score=None, reason=None),
            _entry("c2", status="nonsense-status"),
            # c3 omitted entirely
        ]
    }
    service = RecommendationService(settings(batch_size=8), gateway=RawGateway(body))
    result = await service.recommend(
        RecommendationRequest(viewer=VIEWER, candidates=candidates(4))
    )
    await service.aclose()

    assert [item.candidate_user_id for item in result.recommendations] != []
    assert len(result.recommendations) == 4
    assert [item.rank for item in result.recommendations] == [0, 1, 2, 3]
    by_id = {item.candidate_user_id: item for item in result.recommendations}
    assert by_id["c0"].status is EvaluationStatus.EVALUATED
    assert by_id["c1"].status is EvaluationStatus.INSUFFICIENT_EVIDENCE
    assert by_id["c1"].score is None
    assert by_id["c2"].failure_code is FailureCode.SCHEMA_MISMATCH
    assert by_id["c3"].failure_code is FailureCode.MISSING_IN_RESPONSE
    for item in result.recommendations:
        if item.status is EvaluationStatus.EVALUATED:
            assert item.score is not None and item.reason
        if item.status is EvaluationStatus.FAILED:
            assert item.failure_code is not None
            assert item.score is None
        assert item.notification_eligible is False or item.status is EvaluationStatus.EVALUATED


async def test_cache_hit_is_judged_by_the_current_threshold():
    cache = InMemoryRecommendationCache()
    evidence = list(GROUNDED_EVIDENCE)
    overrides = {"score": 0.8, "evidence": evidence}
    request = RecommendationRequest(viewer=VIEWER, candidates=(HELPER,))

    lenient = StubGateway(overrides=overrides)
    first = await RecommendationService(
        settings(notification_score_threshold=0.5), gateway=lenient, cache=cache
    ).recommend(request)
    assert first.by_candidate_id("helper").notification_eligible is True

    strict_gateway = StubGateway(overrides=overrides)
    second = await RecommendationService(
        settings(notification_score_threshold=0.9), gateway=strict_gateway, cache=cache
    ).recommend(request)
    item = second.by_candidate_id("helper")

    assert second.cache_hits == 1
    assert strict_gateway.completions == 0  # threshold alone must not re-call
    assert item.from_cache is True
    assert item.notification_eligible is False


async def test_changing_the_model_invalidates_the_cache():
    cache = InMemoryRecommendationCache()
    request = RecommendationRequest(viewer=VIEWER, candidates=(HELPER,))
    await RecommendationService(
        settings(model="model-a"), gateway=StubGateway(), cache=cache
    ).recommend(request)
    second = StubGateway()
    result = await RecommendationService(
        settings(model="model-b"), gateway=second, cache=cache
    ).recommend(request)

    assert result.cache_hits == 0
    assert second.completions == 1


async def test_intent_conflict_is_never_notification_eligible():
    evidence = list(GROUNDED_EVIDENCE)
    service = RecommendationService(
        settings(notification_score_threshold=0.5),
        gateway=StubGateway(
            overrides={"score": 0.99, "intent_conflict": True, "evidence": evidence}
        ),
    )
    result = await service.recommend(
        RecommendationRequest(viewer=VIEWER, candidates=(HELPER,))
    )
    await service.aclose()
    item = result.by_candidate_id("helper")

    assert item.status is EvaluationStatus.EVALUATED  # still listed, still chattable
    assert item.intent_conflict is True
    assert item.notification_eligible is False


@pytest.mark.parametrize("raw", ["NaN", "Infinity", "-Infinity"])
async def test_nonfinite_scores_never_reach_a_recommendation(raw):
    body = (
        '{"recommendations": [{"candidate_id": "helper", "status": "evaluated", '
        f'"score": {raw}, "reason": "r", "intent_conflict": false, "evidence": []}}]}}'
    )
    service = RecommendationService(settings(), gateway=RawGateway(body))
    result = await service.recommend(
        RecommendationRequest(viewer=VIEWER, candidates=(HELPER,))
    )
    await service.aclose()
    item = result.by_candidate_id("helper")

    assert item.status is EvaluationStatus.FAILED
    assert item.failure_code is FailureCode.SCHEMA_MISMATCH
    assert item.score is None


@pytest.mark.parametrize(
    "override",
    [
        pytest.param({"score": "0.9"}, id="coerced-score"),
        pytest.param({"intent_conflict": "yes"}, id="coerced-bool"),
        pytest.param({"score": 1}, id="int-score-allowed"),
    ],
)
async def test_scalar_coercion_never_produces_a_confident_recommendation(override):
    service = RecommendationService(
        settings(), gateway=RawGateway({"recommendations": [_entry("helper", **override)]})
    )
    result = await service.recommend(
        RecommendationRequest(viewer=VIEWER, candidates=(HELPER,))
    )
    await service.aclose()
    item = result.by_candidate_id("helper")

    if override == {"score": 1}:
        assert item.status is EvaluationStatus.EVALUATED
        assert item.score == 1.0
    else:
        assert item.status is EvaluationStatus.FAILED


async def test_the_api_key_never_reaches_a_log_record_error_or_dto(caplog):
    secret = "sk-review-canary-0000"
    config = settings(api_key=secret)

    assert secret not in repr(config)
    assert secret not in config.model_dump_json()

    def echo_handler(request: httpx.Request) -> httpx.Response:
        # A provider that reflects the Authorization header back in its body.
        return httpx.Response(
            401, json={"error": request.headers.get("authorization"), "key": secret}
        )

    gateway = OpenAICompatibleGateway(config, transport=httpx.MockTransport(echo_handler))
    assert secret not in repr(gateway)
    service = RecommendationService(config, gateway=gateway)
    with caplog.at_level(logging.DEBUG, logger="app.ai"):
        result = await service.recommend(
            RecommendationRequest(viewer=VIEWER, candidates=(HELPER,))
        )
    await gateway.aclose()
    await service.aclose()

    item = result.by_candidate_id("helper")
    assert item.failure_code is FailureCode.GATEWAY_HTTP_ERROR
    assert secret not in result.model_dump_json()
    assert secret not in "".join(record.getMessage() for record in caplog.records)
    assert secret not in "".join(result.anomalies)


def test_duplicate_and_self_candidates_raise_the_documented_error():
    """``server/docs/ai.md`` fixes ``AIInputError``; pydantic must not wrap it."""
    with pytest.raises(AIInputError):
        RecommendationRequest(viewer=VIEWER, candidates=(HELPER, HELPER))
    with pytest.raises(AIInputError):
        RecommendationRequest(viewer=VIEWER, candidates=(HELPER, VIEWER))


# --- R7b: per-request call accounting on a shared service ----------------


class Overlap:
    """Records whether both viewers ever had a provider request in flight at once.

    This is the precise condition that makes a shared cumulative counter wrong:
    a delta taken around one request is only polluted while another is running.
    """

    def __init__(self) -> None:
        self.in_flight: dict[str, int] = {}
        self.both_in_flight = False

    def enter(self, owner: str) -> None:
        self.in_flight[owner] = self.in_flight.get(owner, 0) + 1
        if len([o for o, n in self.in_flight.items() if n > 0]) > 1:
            self.both_in_flight = True

    def exit(self, owner: str) -> None:
        self.in_flight[owner] -= 1


def viewer_named(user_id: str) -> ParticipantProfile:
    return ParticipantProfile(
        user_id=user_id,
        self_description="배포 파이프라인을 직접 만들고 있습니다.",
        connection_intent="배포 권한 오류를 같이 봐줄 사람을 찾고 있어요.",
        profile_revision=1,
    )


def owned_candidates(prefix: str, count: int) -> tuple[ParticipantProfile, ...]:
    return tuple(
        ParticipantProfile(
            user_id=f"{prefix}{index}",
            self_description="인프라 엔지니어로 일했습니다.",
            connection_intent="배포 권한 오류를 자주 다뤄봤습니다.",
            profile_revision=1,
        )
        for index in range(count)
    )


class SharedCountingGateway:
    """Mimics ``OpenAICompatibleGateway``: one cumulative ``attempts`` counter.

    The real gateway counts every POST on the instance and one service instance
    is shared across viewers, so per-request accounting cannot be a delta of a
    counter that another in-flight request is also advancing.

    This stub deliberately does NOT set ``reports_attempts``, so it exercises
    the service's fallback estimate. Retry-aware counting is covered against the
    real gateway in ``test_r7b_concurrent_retries_are_billed_to_their_own_request``.
    """

    def __init__(self, *, delay: float = 0.0) -> None:
        self.attempts = 0
        self.delay = delay
        self.attempts_by_owner: dict[str, int] = {}
        self.overlap = Overlap()

    async def complete(self, *, system: str, user: str) -> str:
        ids = [c["candidate_id"] for c in json.loads(user)["candidates"]]
        owners = {candidate_id[0] for candidate_id in ids}
        assert len(owners) == 1, f"a batch mixed viewers: {ids}"
        owner = owners.pop()
        self.attempts += 1
        self.attempts_by_owner[owner] = self.attempts_by_owner.get(owner, 0) + 1
        self.overlap.enter(owner)
        try:
            await asyncio.sleep(self.delay)
        finally:
            self.overlap.exit(owner)
        return json.dumps(
            {"recommendations": [_entry(i) for i in ids]}, ensure_ascii=False
        )

    async def aclose(self) -> None:
        return None


async def test_r7b_concurrent_requests_report_only_their_own_gateway_calls():
    """Fallback accounting: an uninstrumented gateway, still scoped per request.

    A gateway that only returns ``str`` cannot expose its internal retries, and
    the service must not try to infer them from an unscoped global counter. For
    such a stub the service falls back to counting ``complete()`` invocations
    (one per batch), which is documented as missing retries by construction.
    What must still hold under concurrency is the *scoping*: A has 3 candidates
    and B has 5 at ``batch_size=1``, so A reports 3 and B reports 5. A delta of
    a shared cumulative counter made each report the running total (8 and 8)
    and the sum double-count.

    Production actual-POST counting is asserted separately, against the real
    adapter, in ``test_r7b_concurrent_retries_are_billed_to_their_own_request``.
    """
    config = settings(batch_size=1, max_concurrent_requests=8, total_timeout_seconds=30)
    gateway = SharedCountingGateway(delay=0.05)
    service = RecommendationService(
        config, gateway=gateway, cache=NullRecommendationCache()
    )
    request_a = RecommendationRequest(
        viewer=viewer_named("A"), candidates=owned_candidates("a", 3)
    )
    request_b = RecommendationRequest(
        viewer=viewer_named("B"), candidates=owned_candidates("b", 5)
    )

    result_a, result_b = await asyncio.gather(
        service.recommend(request_a), service.recommend(request_b)
    )
    await service.aclose()

    assert gateway.overlap.both_in_flight, "the two requests never overlapped"
    assert gateway.attempts_by_owner == {"a": 3, "b": 5}
    assert len(result_a.recommendations) == 3
    assert len(result_b.recommendations) == 5
    assert result_a.gateway_calls == 3
    assert result_b.gateway_calls == 5
    assert result_a.gateway_calls + result_b.gateway_calls == gateway.attempts


async def test_r7b_concurrent_retries_are_billed_to_their_own_request():
    """Production accounting: real adapter, real retries, concurrent requests.

    Uses the production ``OpenAICompatibleGateway`` over ``httpx.MockTransport``
    so the retry loop and the attempt counter are the real ones and every POST
    is observed. Each candidate needs 3 POSTs (two refusals then a success), so
    A costs 9 and B costs 15 while both are in flight together. This is the
    requirement that must not be weakened to batch counting.
    """
    seen: dict[str, int] = {}
    overlap = Overlap()

    async def handler(httpx_request: httpx.Request) -> httpx.Response:
        body = json.loads(httpx_request.content)
        payload = json.loads(body["messages"][1]["content"])
        ids = [c["candidate_id"] for c in payload["candidates"]]
        assert len({i[0] for i in ids}) == 1, f"a batch mixed viewers: {ids}"
        key = ids[0]
        seen[key] = seen.get(key, 0) + 1
        overlap.enter(ids[0][0])
        try:
            # Hold the request open so the other viewer's POSTs overlap it.
            await asyncio.sleep(0.01)
        finally:
            overlap.exit(ids[0][0])
        if seen[key] < 3:
            raise httpx.ConnectError("refused")
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {
                            "content": json.dumps(
                                {"recommendations": [_entry(i) for i in ids]},
                                ensure_ascii=False,
                            )
                        },
                    }
                ]
            },
        )

    config = settings(
        batch_size=1, max_attempts=3, max_concurrent_requests=8, total_timeout_seconds=30
    )
    gateway = OpenAICompatibleGateway(config, transport=httpx.MockTransport(handler))
    service = RecommendationService(
        config, gateway=gateway, cache=NullRecommendationCache()
    )

    result_a, result_b = await asyncio.gather(
        service.recommend(
            RecommendationRequest(
                viewer=viewer_named("A"), candidates=owned_candidates("a", 3)
            )
        ),
        service.recommend(
            RecommendationRequest(
                viewer=viewer_named("B"), candidates=owned_candidates("b", 5)
            )
        ),
    )
    await gateway.aclose()
    await service.aclose()

    # Without real overlap this test could not tell the schemes apart: a
    # shared-counter delta is only wrong when another request is in flight.
    assert overlap.both_in_flight, "the two requests never overlapped"
    assert sum(seen.values()) == 24  # 8 candidates x 3 POSTs each
    assert gateway.attempts == 24  # the lifetime counter still spans both
    assert result_a.gateway_calls == 9
    assert result_b.gateway_calls == 15
    assert result_a.gateway_calls + result_b.gateway_calls == gateway.attempts
    assert {i.status for i in result_a.recommendations} == {EvaluationStatus.EVALUATED}
    assert {i.status for i in result_b.recommendations} == {EvaluationStatus.EVALUATED}


async def test_sequential_requests_on_a_shared_service_stay_exact():
    """The sequential control: correct before the fix, and must stay correct."""
    config = settings(batch_size=1, total_timeout_seconds=30)
    gateway = SharedCountingGateway()
    service = RecommendationService(
        config, gateway=gateway, cache=NullRecommendationCache()
    )
    first = await service.recommend(
        RecommendationRequest(
            viewer=viewer_named("A"), candidates=owned_candidates("a", 3)
        )
    )
    second = await service.recommend(
        RecommendationRequest(
            viewer=viewer_named("B"), candidates=owned_candidates("b", 5)
        )
    )
    await service.aclose()

    assert first.gateway_calls == 3
    assert second.gateway_calls == 5
    assert gateway.attempts == 8


# --- TokenUsage: per-request scoping and honest completeness -------------


def _usage_transport(usage_for, counts: dict | None = None, overlap: Overlap | None = None):
    """MockTransport answering every candidate in the batch, with usage attached.

    ``usage_for(call_index, owner)`` returns the provider ``usage`` object, or
    ``None`` to answer without one.
    """
    state = {"calls": 0}

    async def handler(httpx_request: httpx.Request) -> httpx.Response:
        payload = json.loads(json.loads(httpx_request.content)["messages"][1]["content"])
        ids = [c["candidate_id"] for c in payload["candidates"]]
        owner = ids[0][0]
        state["calls"] += 1
        index = state["calls"]
        if counts is not None:
            counts[owner] = counts.get(owner, 0) + 1
        if overlap is not None:
            overlap.enter(owner)
            try:
                await asyncio.sleep(0.02)
            finally:
                overlap.exit(owner)
        body: dict = {
            "choices": [
                {
                    "finish_reason": "stop",
                    "message": {
                        "content": json.dumps(
                            {"recommendations": [_entry(i) for i in ids]},
                            ensure_ascii=False,
                        )
                    },
                }
            ]
        }
        usage = usage_for(index, owner)
        if usage is not None:
            body["usage"] = usage
        return httpx.Response(200, json=body)

    return httpx.MockTransport(handler)


async def test_usage_is_scoped_to_its_own_request():
    """Concurrent viewers on one service and one client never mix token counts."""
    overlap = Overlap()

    def usage_for(_index: int, owner: str) -> dict:
        per = 10 if owner == "a" else 100  # A is cheap, B is expensive
        return {"prompt_tokens": per, "completion_tokens": per, "total_tokens": 2 * per}

    config = settings(batch_size=1, max_concurrent_requests=8, total_timeout_seconds=30)
    gateway = OpenAICompatibleGateway(
        config, transport=_usage_transport(usage_for, overlap=overlap)
    )
    service = RecommendationService(
        config, gateway=gateway, cache=NullRecommendationCache()
    )

    result_a, result_b = await asyncio.gather(
        service.recommend(
            RecommendationRequest(
                viewer=viewer_named("A"), candidates=owned_candidates("a", 3)
            )
        ),
        service.recommend(
            RecommendationRequest(
                viewer=viewer_named("B"), candidates=owned_candidates("b", 5)
            )
        ),
    )
    await gateway.aclose()
    await service.aclose()

    assert overlap.both_in_flight, "the two requests never overlapped"
    assert (result_a.usage.input_tokens, result_a.usage.output_tokens) == (30, 30)
    assert result_a.usage.total_tokens == 60
    assert result_a.usage.provider_calls == 3
    assert (result_b.usage.input_tokens, result_b.usage.output_tokens) == (500, 500)
    assert result_b.usage.total_tokens == 1000
    assert result_b.usage.provider_calls == 5
    assert result_a.usage.complete and result_b.usage.complete


async def test_usage_without_any_provider_call_reports_measured_zero():
    """Served entirely from cache: zero really is the measurement."""
    cache = InMemoryRecommendationCache()
    config = settings(batch_size=1)
    gateway = OpenAICompatibleGateway(
        config,
        transport=_usage_transport(
            lambda _index, _owner: {
                "prompt_tokens": 7,
                "completion_tokens": 7,
                "total_tokens": 14,
            }
        ),
    )
    service = RecommendationService(config, gateway=gateway, cache=cache)
    request = RecommendationRequest(viewer=VIEWER, candidates=(HELPER,))

    first = await service.recommend(request)
    second = await service.recommend(request)
    await gateway.aclose()
    await service.aclose()

    assert first.usage.provider_calls == 1
    assert second.cache_hits == 1
    assert second.usage.provider_calls == 0
    assert (second.usage.input_tokens, second.usage.output_tokens) == (0, 0)
    assert second.usage.total_tokens == 0
    assert second.usage.complete is True


async def test_partially_reported_usage_is_not_marked_complete():
    """A field only some calls reported must not be presented as the whole bill.

    Call 1 reports ``prompt_tokens`` alone; call 2 reports all three. The input
    sum then spans both calls while output and total cover only call 2, so the
    three numbers are not even mutually consistent (300 + 50 != 250). Counting
    a call as "reported" because it sent *any* field lets that pass as a
    complete accounting.
    """

    def usage_for(index: int, _owner: str) -> dict:
        if index == 1:
            return {"prompt_tokens": 100}
        return {"prompt_tokens": 200, "completion_tokens": 50, "total_tokens": 250}

    config = settings(batch_size=1)
    gateway = OpenAICompatibleGateway(config, transport=_usage_transport(usage_for))
    service = RecommendationService(
        config, gateway=gateway, cache=NullRecommendationCache()
    )
    result = await service.recommend(
        RecommendationRequest(viewer=VIEWER, candidates=owned_candidates("a", 2))
    )
    await gateway.aclose()
    await service.aclose()

    assert result.usage.provider_calls == 2
    assert result.usage.input_tokens == 300  # both calls reported this one
    # Only one of the two calls reported these, so they are not a full total.
    assert result.usage.complete is False


async def test_usage_absent_entirely_is_unknown_not_zero():
    """Provider requests that answered without usage leave counts unknown."""
    config = settings(batch_size=1)
    gateway = OpenAICompatibleGateway(
        config, transport=_usage_transport(lambda _index, _owner: None)
    )
    service = RecommendationService(
        config, gateway=gateway, cache=NullRecommendationCache()
    )
    result = await service.recommend(
        RecommendationRequest(viewer=VIEWER, candidates=owned_candidates("a", 2))
    )
    await gateway.aclose()
    await service.aclose()

    assert result.usage.provider_calls == 2
    assert result.usage.reported_calls == 0
    assert result.usage.input_tokens is None  # unknown, never a fabricated 0
    assert result.usage.complete is False
