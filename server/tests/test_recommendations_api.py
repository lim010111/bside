"""The ``recommendation`` field on ``POST /discovery/observations``.

The subject here is the boundary, not the model. What has to hold: the gateway
is never touched while a request is in flight, nothing server-side leaks into
the response, and a recommendation never changes who is listed.
"""

import asyncio
import os
import subprocess
import sys
import time

import pytest
from fastapi.testclient import TestClient
from redis.asyncio import Redis

from app.ai import (
    AISettings,
    CandidateRecommendation,
    EvaluationStatus,
    ExcerptSource,
    FailureCode,
    GroundingExcerpt,
    InMemoryRecommendationCache,
    ParticipantProfile,
    RecommendationService,
    SYSTEM_INSTRUCTIONS,
    build_cache_key,
)
from app.config import Settings
from app.main import create_app
from app.recommendations import Recommendations


class BlockingGateway:
    """Stands in for a provider that takes seconds to answer.

    It blocks rather than raising on purpose. A gateway that raised instantly
    would let a request that *did* await the evaluation still return fast, so
    the test would pass on exactly the regression it exists to catch. The
    background tasks left waiting here are cancelled by the app's shutdown.
    """

    BLOCK_SECONDS = 30.0

    def __init__(self) -> None:
        self.calls = 0

    async def complete(self, *args, **kwargs):
        self.calls += 1
        await asyncio.sleep(self.BLOCK_SECONDS)
        raise AssertionError("unreachable: the evaluation is cancelled at shutdown")

    async def aclose(self) -> None:
        return None


def _ai_settings() -> AISettings:
    # _env_file=None: server/.env holds a real key, and a test must never be one
    # edit away from calling a paid provider.
    return AISettings(
        _env_file=None,
        api_key="test-key",
        base_url="https://example.invalid/v1",
        model="test-model",
    )


@pytest.fixture
def ai(client: TestClient):
    """Configure the running app's recommendation bridge.

    It replaces the bridge on the app ``client`` and ``install`` already use:
    a second app would have its own Redis keys and its own state, and the
    requests under test would never reach it.
    """
    cache = InMemoryRecommendationCache()
    service = RecommendationService(_ai_settings(), gateway=BlockingGateway(), cache=cache)
    bridge = Recommendations(
        service, cache, settings=service.settings, redis=client.app.state.redis
    )
    client.app.state.recommendations = bridge  # closed by the app's own shutdown
    return Evaluations(bridge, cache)


class Evaluations:
    """Puts an evaluation in the cache exactly where a real one would land."""

    def __init__(self, bridge: Recommendations, cache: InMemoryRecommendationCache) -> None:
        self.bridge = bridge
        self.cache = cache
        self.gateway = bridge._service._gateway

    def profile(self, user_id: str, nickname: str, revision: int = 1) -> ParticipantProfile:
        """The snapshot ``Installation.profile()`` leaves in Redis."""
        return ParticipantProfile(
            user_id=user_id,
            self_description=f"{nickname}의 자기소개입니다",
            connection_intent=f"{nickname}가 만나고 싶은 사람입니다",
            profile_revision=revision,
        )

    def store(self, viewer: ParticipantProfile, candidate: ParticipantProfile, **fields) -> None:
        key = build_cache_key(
            namespace=self.bridge._settings.cache_namespace,
            viewer=viewer,
            candidate=candidate,
            inference_digest=self.bridge._service.inference_digest,
        )
        entry = CandidateRecommendation(
            candidate_user_id=candidate.user_id,
            # The service stores every entry with rank 0; a position is only
            # meaningful against the set it was compared with.
            rank=0,
            viewer_profile_revision=viewer.profile_revision,
            candidate_profile_revision=candidate.profile_revision,
            **fields,
        )
        asyncio.run(self.cache.set(key, entry, 60))

    def claim(self, settings: Settings, viewer, candidates) -> bool:
        """Take the background-job lock as a separate worker would.

        A fresh bridge over a fresh connection each time: the app's own client
        belongs to the TestClient's event loop, and the lock is supposed to
        hold between processes anyway, not between two calls on one object.
        """

        async def run() -> bool:
            redis = Redis.from_url(settings.redis_url, decode_responses=True)
            bridge = Recommendations(
                self.bridge._service, self.cache, settings=self.bridge._settings, redis=redis
            )
            try:
                return await bridge._claim(viewer, candidates)
            finally:
                await redis.aclose()

        return asyncio.run(run())

    def evaluated(self, viewer, candidate, *, score: float, reason: str, quote: str) -> None:
        self.store(
            viewer,
            candidate,
            status=EvaluationStatus.EVALUATED,
            score=score,
            reason=reason,
            excerpts=(
                GroundingExcerpt(
                    source=ExcerptSource.CANDIDATE_SELF_DESCRIPTION,
                    quote=quote,
                    verified=True,
                ),
            ),
            notification_eligible=True,
        )


def test_an_unevaluated_candidate_is_pending_without_waiting_for_the_gateway(ai, install):
    """The nearby list has to render now; an evaluation takes seconds.

    The gateway blocks for 30s here, so awaiting it anywhere on the request path
    shows up as a request that takes 30s instead of milliseconds.
    """
    alice, bob = install("앨리스"), install("밥")

    started = time.perf_counter()
    observed = alice.observe(bob.identifier())
    elapsed = time.perf_counter() - started

    assert [row["recommendation"] for row in observed] == [{"status": "pending", "rank": 0}]
    assert elapsed < 2.0, f"요청이 평가를 기다렸습니다: {elapsed:.1f}s"


def test_a_cached_evaluation_becomes_a_reason_and_nothing_else(ai, install):
    alice, bob = install("앨리스"), install("밥")
    ai.evaluated(
        ai.profile(alice.user_id, "앨리스"),
        ai.profile(bob.user_id, "밥"),
        score=0.82,
        reason="두 분 다 배포 파이프라인을 이야기하고 있어요.",
        quote="밥의 자기소개입니다",
    )

    recommendation = alice.observe(bob.identifier())[0]["recommendation"]

    assert recommendation == {
        "status": "ready",
        "rank": 0,
        "reason": "두 분 다 배포 파이프라인을 이야기하고 있어요.",
    }
    # Named individually so a future field cannot leak by being forgotten here.
    for private in ("score", "excerpts", "notification_eligible", "viewer_profile_revision"):
        assert private not in recommendation


@pytest.mark.parametrize(
    "status,failure,expected",
    [
        (EvaluationStatus.INSUFFICIENT_EVIDENCE, None, "unscored"),
        (EvaluationStatus.PENDING, None, "pending"),
        # Not reachable through the cache today - the service never stores a
        # failure - but if one is ever stored it must not read as a low score.
        (EvaluationStatus.FAILED, FailureCode.GATEWAY_TIMEOUT, "failed"),
    ],
)
def test_the_other_outcomes_keep_their_own_meaning(ai, install, status, failure, expected):
    """'unscored' is not a failure, and a failure is not a low score."""
    alice, bob = install("앨리스"), install("밥")
    ai.store(
        ai.profile(alice.user_id, "앨리스"),
        ai.profile(bob.user_id, "밥"),
        status=status,
        failure_code=failure,
    )

    recommendation = alice.observe(bob.identifier())[0]["recommendation"]

    assert recommendation["status"] == expected
    assert "reason" not in recommendation


def test_the_rank_orders_the_people_in_this_response(ai, install):
    """Every stored entry has rank 0, so the order has to be computed here.

    Reading stored ranks would give three candidates rank 0 and no order at all.
    """
    alice = install("앨리스")
    strong, weak, quiet, unknown = (install(name) for name in ("강함", "약함", "조용", "미지"))
    viewer = ai.profile(alice.user_id, "앨리스")

    ai.evaluated(viewer, ai.profile(weak.user_id, "약함"), score=0.40,
                 reason="약한 접점이 하나 있어요.", quote="약함의 자기소개입니다")
    ai.evaluated(viewer, ai.profile(strong.user_id, "강함"), score=0.90,
                 reason="강한 접점이 있어요.", quote="강함의 자기소개입니다")
    ai.store(viewer, ai.profile(quiet.user_id, "조용"),
             status=EvaluationStatus.INSUFFICIENT_EVIDENCE)

    observed = alice.observe(
        *(person.identifier() for person in (unknown, quiet, weak, strong))
    )
    ranks = {row["user_id"]: row["recommendation"]["rank"] for row in observed}

    assert ranks[strong.user_id] == 0, "높은 점수가 먼저"
    assert ranks[weak.user_id] == 1
    assert ranks[quiet.user_id] == 2, "평가는 됐지만 접점 없음은 평가된 사람들 뒤"
    assert ranks[unknown.user_id] == 3, "아직 평가 전은 맨 뒤"
    assert sorted(ranks.values()) == [0, 1, 2, 3], "순위는 중복 없이 연속"


def test_editing_a_profile_retires_the_reason_that_quoted_it(ai, install):
    """A reason quotes the user's words. Replace them and it must not show."""
    alice, bob = install("앨리스"), install("밥")
    ai.evaluated(
        ai.profile(alice.user_id, "앨리스"),
        ai.profile(bob.user_id, "밥"),
        score=0.8,
        reason="예전 소개를 인용한 이유입니다.",
        quote="밥의 자기소개입니다",
    )
    assert alice.observe(bob.identifier())[0]["recommendation"]["status"] == "ready"

    response = bob.post(
        "/api/v1/me/profile",
        json={
            "nickname": "밥",
            "self_description": "완전히 다른 소개로 바꿨습니다",
            "connection_intent": "밥이 만나고 싶은 사람입니다",
        },
    )
    assert response.status_code == 200, response.text

    assert alice.observe(bob.identifier())[0]["recommendation"]["status"] == "pending"


def test_resubmitting_an_identical_profile_keeps_the_evaluation(ai, install):
    """An identical save changes nothing, so it must not discard paid-for work."""
    alice, bob = install("앨리스"), install("밥")
    ai.evaluated(
        ai.profile(alice.user_id, "앨리스"),
        ai.profile(bob.user_id, "밥"),
        score=0.8,
        reason="그대로 남아 있어야 하는 이유입니다.",
        quote="밥의 자기소개입니다",
    )

    bob.profile("밥")  # the same three values again

    assert alice.observe(bob.identifier())[0]["recommendation"]["status"] == "ready"


def test_a_viewer_edit_retires_their_own_reasons_too(ai, install):
    """The evaluation is directed: it read the viewer's words as well."""
    alice, bob = install("앨리스"), install("밥")
    ai.evaluated(
        ai.profile(alice.user_id, "앨리스"),
        ai.profile(bob.user_id, "밥"),
        score=0.8,
        reason="앨리스의 예전 의도를 인용한 이유입니다.",
        quote="밥의 자기소개입니다",
    )
    assert alice.observe(bob.identifier())[0]["recommendation"]["status"] == "ready"

    alice.post(
        "/api/v1/me/profile",
        json={
            "nickname": "앨리스",
            "self_description": "앨리스의 자기소개입니다",
            "connection_intent": "이제 다른 사람을 찾고 있습니다",
        },
    )

    assert alice.observe(bob.identifier())[0]["recommendation"]["status"] == "pending"


def test_a_recommendation_never_changes_who_is_listed(ai, install):
    """Unevaluated is not a reason to hide someone who is actually nearby."""
    alice = install("앨리스")
    others = [install(f"후보{index}") for index in range(3)]

    observed = alice.observe(*(other.identifier() for other in others))

    assert {row["user_id"] for row in observed} == {other.user_id for other in others}
    assert all(row["recommendation"]["status"] == "pending" for row in observed)


def test_the_same_batch_is_only_paid_for_once(ai, settings):
    """A client polls every 15s while an evaluation takes seconds.

    Without the claim the second poll starts a duplicate of work already in
    flight, and the provider is paid twice for the same answer. Each claim runs
    through its own bridge and its own connection, which is what a second
    uvicorn worker looks like.
    """
    viewer = ai.profile("viewer", "앨리스")
    candidates = (ai.profile("candidate", "밥"),)

    assert ai.claim(settings, viewer, candidates) is True
    assert ai.claim(settings, viewer, candidates) is False, "진행 중인 평가를 또 시작했습니다"


def test_a_different_set_of_people_is_its_own_batch(ai, settings):
    """The lock must not make a newly seen neighbour wait for the last batch."""
    viewer = ai.profile("viewer", "앨리스")

    assert ai.claim(settings, viewer, (ai.profile("bob", "밥"),)) is True
    assert ai.claim(settings, viewer, (ai.profile("carol", "캐럴"),)) is True


def test_the_job_key_is_the_same_in_every_worker():
    """Workers must agree on the key or the lock only dedupes against itself.

    ``hash()`` on a str is salted per process, so a key built from one would
    differ between uvicorn workers and never collide - precisely the case the
    lock exists for. Two interpreters with different salts settle it.
    """
    program = (
        "from app.recommendations import job_key;"
        "from app.ai import ParticipantProfile as P;"
        "print(job_key('viewer', 'digest',"
        " (P(user_id='b', profile_revision=1), P(user_id='a', profile_revision=1))))"
    )

    def key_with(seed: str) -> str:
        result = subprocess.run(
            [sys.executable, "-c", program],
            capture_output=True,
            text=True,
            check=True,
            env=os.environ | {"PYTHONHASHSEED": seed},
        )
        return result.stdout.strip()

    assert key_with("0") == key_with("1")


def test_the_prompt_knows_the_reason_is_shown_to_the_viewer():
    """`reason` goes straight onto a screen, unedited.

    Detail.jsx renders it under '왜 추천했나요?' with no rewriting, so the model
    has to be told who reads it. Without that the live model wrote analyst prose
    naming its own internal roles: '조회자는 ... 후보는 ...'. Only the instruction
    is checkable here; the wording it produces is a live-model question
    (server/docs/ai-validation.md).
    """
    assert "조회자에게 그대로 보여주는 문장" in SYSTEM_INSTRUCTIONS
    assert "내부 호칭" in SYSTEM_INSTRUCTIONS


def test_without_configuration_the_field_says_unavailable(client, install):
    """The default app has no AI configured. That is a state, not an error."""
    alice, bob = install("앨리스"), install("밥")

    recommendation = alice.observe(bob.identifier())[0]["recommendation"]

    # No rank either: with nothing evaluated there is no order to claim.
    assert recommendation == {"status": "unavailable"}
