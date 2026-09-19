"""AI 추천 모듈의 수용 테스트.

검증 담당 소유. 구현 담당의 단위 테스트(`tests/test_ai.py`)와 목적이 다르다. 여기서는
평가 사례(`server/evals/fixtures/cases/*.json`)와 E01~E08 수용 기준을 기준으로, 모듈이
계약을 지키는지 본다. 네트워크와 모델 인증 없이 결정론적으로 돈다.

여기의 통과는 **계약 준수**의 근거이지 추천 품질의 근거가 아니다. 품질은 실모델 실행으로만
말할 수 있고 그 기록은 `server/docs/ai-validation.md` 에 있다.
"""

import json
import sys
from pathlib import Path

import pytest

EVALS_DIR = Path(__file__).resolve().parents[1] / "evals"
sys.path.insert(0, str(EVALS_DIR))

from app.ai import (  # noqa: E402
    AISettings,
    EvaluationStatus,
    FailureCode,
    InMemoryRecommendationCache,
    NotificationPolicy,
    RecommendationService,
    matches_current_inputs,
    pending_result,
    stale_candidate_ids,
)
from harness import (  # noqa: E402
    FaultGateway,
    ScriptedGateway,
    list_cases,
    load_case,
    to_request,
)

OFFLINE_SETTINGS = dict(
    api_key="offline-unused",
    base_url="https://ai.cs.kookmin.ac.kr/v1",
    model="scripted-offline",
    # 실모델 실행에서 기본값 1400 이 5명 배치를 잘라 INVALID_JSON 을 낸 것을 확인했다.
    # 가짜 게이트웨이는 잘리지 않지만, 테스트가 기본값에 묶이지 않도록 명시한다.
    max_output_tokens=4096,
)


def settings(**overrides) -> AISettings:
    return AISettings(_env_file=None, **{**OFFLINE_SETTINGS, **overrides})


async def evaluate(case_id, *, cache=None, gateway=None, **overrides):
    fixture = load_case(case_id)
    request = to_request(fixture["request"])
    fault = fixture["request"].get("fault")
    gateway = gateway or (FaultGateway(fault["kind"]) if fault else ScriptedGateway())
    async with RecommendationService(
        settings(**overrides),
        cache=cache or InMemoryRecommendationCache(),
        gateway=gateway,
    ) as service:
        return fixture, request, await service.recommend(request)


# --------------------------------------------------------------------- 사례 자체의 건전성
def test_every_case_loads_and_expectations_are_labelled_as_hypotheses():
    """기대값은 사람이 확정한 정답이 아니라는 표시가 모든 사례에 있어야 한다."""
    ids = list_cases()
    assert len(ids) >= 15, ids
    for case_id in ids:
        fixture = load_case(case_id)
        expectations = fixture["expectations"]
        assert expectations["status"] == "provisional-hypothesis", case_id
        assert expectations["human_reviewed"] is False, case_id
        assert expectations["authored_before_any_model_output"] is True, case_id
        assert expectations["rationale"].strip(), case_id
        assert fixture["request"]["candidates"], case_id


def test_heldout_cases_never_reuse_tuning_participants():
    """보류 사례가 조정용 인물을 쓰면 보류 성격이 사라진다."""
    from harness.fixtures import HELDOUT_POOL, TUNING_POOL

    tuning_only = set(TUNING_POOL) - set(HELDOUT_POOL)
    for case_id in list_cases("heldout"):
        request = load_case(case_id)["request"]
        used = {request["viewer"]["user_id"]} | {c["user_id"] for c in request["candidates"]}
        assert not (used & tuning_only), f"{case_id} 가 조정용 인물을 씁니다: {used & tuning_only}"


def test_fresh_holdout_shares_nobody_with_earlier_pools():
    """프롬프트 동결 후 만든 신선 보류는 앞서 결과를 본 인물과 겹치면 안 된다."""
    from harness.fixtures import FRESH_POOL, HELDOUT_POOL, TUNING_POOL

    seen = set(TUNING_POOL) | set(HELDOUT_POOL)
    assert not (set(FRESH_POOL) & seen), set(FRESH_POOL) & seen
    fresh_cases = list_cases("heldout-fresh")
    assert fresh_cases, "신선 보류 사례가 없습니다"
    for case_id in fresh_cases:
        request = load_case(case_id)["request"]
        used = {request["viewer"]["user_id"]} | {c["user_id"] for c in request["candidates"]}
        assert used <= set(FRESH_POOL), f"{case_id} 가 신선 풀 밖의 인물을 씁니다: {used - set(FRESH_POOL)}"


@pytest.mark.parametrize(
    ("first", "second"), [("E01", "E02"), ("E01", "E07"), ("H01", "H02")]
)
def test_intent_switch_pairs_differ_only_in_connection_intent(first, second):
    """핵심 시연 쌍은 교류 의도 외의 모든 입력이 같아야 한다."""
    a, b = load_case(first)["request"], load_case(second)["request"]
    assert a["viewer"]["self_description"] == b["viewer"]["self_description"]
    assert a["viewer"]["user_id"] == b["viewer"]["user_id"]
    assert a["viewer"]["connection_intent"] != b["viewer"]["connection_intent"]
    # 후보 제시 순서까지 같아야 한다. 순서가 다르면 순위가 바뀐 원인이 의도 변경인지 배치
    # 맥락·동점 처리의 차이인지 구분할 수 없다(shuffle_group 으로 시드를 공유한다).
    assert [c["user_id"] for c in a["candidates"]] == [c["user_id"] for c in b["candidates"]]
    assert a["shuffle_group"] == b["shuffle_group"]
    assert {c["user_id"]: c["self_description"] for c in a["candidates"]} == {
        c["user_id"]: c["self_description"] for c in b["candidates"]
    }


# --------------------------------------------------------------------- 공통 계약
@pytest.mark.parametrize("case_id", list_cases())
async def test_every_candidate_is_returned_exactly_once(case_id):
    """낮은 평가·실패·근거 부족 어느 것도 후보를 목록에서 지우지 않는다."""
    _, request, result = await evaluate(case_id)
    returned = [r.candidate_user_id for r in result.recommendations]
    assert sorted(returned) == sorted(c.user_id for c in request.candidates)
    assert len(returned) == len(set(returned))


@pytest.mark.parametrize("case_id", list_cases())
async def test_input_revisions_are_echoed_never_altered(case_id):
    _, request, result = await evaluate(case_id)
    revisions = {c.user_id: c.profile_revision for c in request.candidates}
    assert result.viewer_profile_revision == request.viewer.profile_revision
    for item in result.recommendations:
        assert item.viewer_profile_revision == request.viewer.profile_revision
        assert item.candidate_profile_revision == revisions[item.candidate_user_id]


@pytest.mark.parametrize("case_id", list_cases())
async def test_reasons_and_excerpts_stay_grounded_in_supplied_text(case_id):
    """이유의 인용과 근거 구절은 양쪽이 실제로 쓴 원문에서만 나와야 한다."""
    _, request, result = await evaluate(case_id)
    fields = {
        "viewer_self_description": request.viewer.self_description,
        "viewer_connection_intent": request.viewer.connection_intent,
    }
    by_id = {c.user_id: c for c in request.candidates}
    for item in result.recommendations:
        candidate = by_id[item.candidate_user_id]
        table = {
            **fields,
            "candidate_self_description": candidate.self_description,
            "candidate_connection_intent": candidate.connection_intent,
        }
        for excerpt in item.excerpts:
            source = table[excerpt.source.value]
            assert excerpt.quote in source, f"{case_id}/{item.candidate_user_id}: 원문에 없는 인용"
            assert excerpt.verified is True, f"{case_id}/{item.candidate_user_id}: 미검증 인용이 남음"


@pytest.mark.parametrize("case_id", list_cases())
async def test_numeric_scores_never_appear_in_user_facing_reasons(case_id):
    _, _, result = await evaluate(case_id)
    for item in result.recommendations:
        if not item.reason:
            continue
        assert item.score is None or f"{item.score}" not in item.reason
        assert "점수" not in item.reason


@pytest.mark.parametrize("case_id", list_cases())
async def test_notification_eligibility_requires_a_successful_evaluation(case_id):
    _, _, result = await evaluate(case_id)
    for item in result.recommendations:
        if item.notification_eligible:
            assert item.status is EvaluationStatus.EVALUATED
            assert item.reason
            assert not item.intent_conflict


# --------------------------------------------------------------------- E05 / E06 / E08
async def test_e05_ambiguous_input_is_insufficient_evidence_not_failure():
    """근거 부족을 오류나 '적합성 낮음'과 같은 것으로 처리하지 않는다."""
    _, _, result = await evaluate("E05")
    statuses = {r.candidate_user_id: r.status for r in result.recommendations}
    assert EvaluationStatus.FAILED not in statuses.values()
    insufficient = [s for s in statuses.values() if s is EvaluationStatus.INSUFFICIENT_EVIDENCE]
    assert len(insufficient) >= 2, statuses
    assert not any(r.notification_eligible for r in result.recommendations)


async def test_e06_injected_instructions_do_not_change_the_candidate_set_or_format():
    fixture, request, result = await evaluate("E06")
    assert len(result.recommendations) == len(request.candidates)
    # 사용자에게 보이는 것은 reason 이다. 주입이 요구한 문구가 여기 나오면 지시를 따른 것이다.
    reasons = " ".join(r.reason or "" for r in result.recommendations)
    for forbidden in fixture["expectations"]["forbidden_substrings_anywhere"]:
        assert forbidden not in reasons, f"주입이 요구한 문구가 이유에 나타남: {forbidden}"
    # 주입한 후보가 1순위를 가져가면 안 된다.
    evaluated = sorted(
        (r for r in result.recommendations if r.status is EvaluationStatus.EVALUATED),
        key=lambda r: r.rank,
    )
    if evaluated:
        assert evaluated[0].candidate_user_id != "injector_a"


async def test_e08_gateway_timeout_is_reported_as_failure_with_every_candidate_kept():
    fixture, request, result = await evaluate("E08")
    assert len(result.recommendations) == len(request.candidates)
    for item in result.recommendations:
        assert item.status is EvaluationStatus.FAILED
        assert item.failure_code is FailureCode.GATEWAY_TIMEOUT
        assert item.reason is None, "실패를 이유가 있는 성공처럼 꾸미면 안 된다"
        assert item.notification_eligible is False


@pytest.mark.parametrize(
    ("kind", "expected"),
    [
        ("invalid_json", FailureCode.INVALID_JSON),
        ("gateway_http_error", FailureCode.GATEWAY_HTTP_ERROR),
        ("missing_candidate", FailureCode.MISSING_IN_RESPONSE),
    ],
)
async def test_gateway_faults_map_to_distinct_failure_codes(kind, expected):
    """서버가 재시도·안내를 고르려면 실패 원인이 구분돼야 한다."""
    _, request, result = await evaluate("E01", gateway=FaultGateway(kind))
    assert len(result.recommendations) == len(request.candidates)
    assert {r.failure_code for r in result.recommendations} == {expected}


async def test_a_candidate_the_model_invented_is_not_returned():
    """모델이 없는 후보를 만들어 보내도 결과에 들어오지 않는다."""
    _, request, result = await evaluate("E01", gateway=FaultGateway("invented_candidate"))
    returned = {r.candidate_user_id for r in result.recommendations}
    assert returned == {c.user_id for c in request.candidates}
    assert "ghost_user" not in returned


# --------------------------------------------------------------------- E07 캐시·버전
async def test_e07_editing_the_intent_does_not_serve_the_previous_evaluation():
    """입력을 고치면 이전 버전의 결과가 재사용되면 안 된다."""
    cache = InMemoryRecommendationCache()
    gateway = ScriptedGateway()
    async with RecommendationService(settings(), cache=cache, gateway=gateway) as service:
        before = to_request(load_case("E01")["request"])
        first = await service.recommend(before)
        calls_after_first = gateway.calls

        # 같은 입력을 다시 물으면 캐시에서 나와야 한다(게이트웨이 호출 증가 없음).
        repeat = await service.recommend(before)
        assert gateway.calls == calls_after_first
        assert repeat.cache_hits > 0

        # 의도를 고쳐 버전이 올라가면 다시 평가해야 한다.
        after = to_request(load_case("E07")["request"])
        second = await service.recommend(after)
        assert gateway.calls > calls_after_first, "수정된 입력인데 캐시가 그대로 쓰였다"
        assert second.viewer_profile_revision == 2
        assert all(r.viewer_profile_revision == 2 for r in second.recommendations)
        assert not matches_current_inputs(first, after)
        assert stale_candidate_ids(first, after)


async def test_changing_model_or_prompt_does_not_reuse_the_other_configuration_result():
    """모델·프롬프트가 바뀌면 같은 캐시 항목을 나눠 쓰지 않는다."""
    cache = InMemoryRecommendationCache()
    request = to_request(load_case("E01")["request"])
    gateway_a, gateway_b = ScriptedGateway(), ScriptedGateway()
    async with RecommendationService(settings(model="model-a"), cache=cache, gateway=gateway_a) as a:
        await a.recommend(request)
    async with RecommendationService(settings(model="model-b"), cache=cache, gateway=gateway_b) as b:
        result = await b.recommend(request)
    assert gateway_b.calls > 0, "모델이 달라졌는데 다른 모델의 결과를 재사용했다"
    assert result.cache_hits == 0


async def test_pending_result_lists_every_candidate_without_calling_the_gateway():
    """목록 즉시 표시용. AI 결과를 기다리지 않고도 후보가 모두 나와야 한다."""
    request = to_request(load_case("E01")["request"])
    result = pending_result(request)
    assert len(result.recommendations) == len(request.candidates)
    assert all(r.status is EvaluationStatus.PENDING for r in result.recommendations)
    assert all(not r.notification_eligible for r in result.recommendations)
    assert result.gateway_calls == 0


# --------------------------------------------------------------------- 알림 하이퍼파라미터
async def test_notification_threshold_is_adjustable_and_never_removes_candidates():
    """임계값은 조절 가능한 하이퍼파라미터이며 목록에서 사람을 지우지 않는다."""
    counts = {}
    for threshold in (0.0, 0.5, 1.0):
        _, request, result = await evaluate("E01", notification_score_threshold=threshold)
        counts[threshold] = sum(1 for r in result.recommendations if r.notification_eligible)
        assert len(result.recommendations) == len(request.candidates)
    assert counts[0.0] >= counts[0.5] >= counts[1.0]
    assert counts[1.0] == 0, "임계값 1.0 에서도 알림이 나가면 기준이 적용되지 않는 것이다"
    assert counts[0.0] > 0, "임계값 0.0 에서 아무도 적합하지 않으면 다른 조건이 막고 있는 것이다"


async def test_notification_cap_limits_how_many_are_marked():
    _, _, result = await evaluate("E01", notification_score_threshold=0.0, notification_max_per_request=1)
    assert sum(1 for r in result.recommendations if r.notification_eligible) == 1


async def test_eligibility_is_recomputed_on_a_cache_hit_under_the_current_policy():
    """캐시에서 나온 결과라도 지금의 알림 기준으로 다시 판단해야 한다."""
    cache = InMemoryRecommendationCache()
    request = to_request(load_case("E01")["request"])
    async with RecommendationService(
        settings(notification_score_threshold=0.0), cache=cache, gateway=ScriptedGateway()
    ) as lenient:
        generous = await lenient.recommend(request)
    async with RecommendationService(
        settings(notification_score_threshold=1.0), cache=cache, gateway=ScriptedGateway()
    ) as strict:
        cautious = await strict.recommend(request)
    assert any(r.notification_eligible for r in generous.recommendations)
    assert not any(r.notification_eligible for r in cautious.recommendations)


def test_notification_policy_ignores_rank_on_its_own():
    """상위 1명이라는 이유만으로 알림 적합이 되어서는 안 된다."""
    policy = NotificationPolicy(version="test", score_threshold=0.72)
    from app.ai.models import CandidateRecommendation

    top_but_weak = CandidateRecommendation(
        candidate_user_id="x",
        status=EvaluationStatus.EVALUATED,
        rank=0,
        score=0.1,
        reason="약한 연결점입니다.",
        viewer_profile_revision=1,
        candidate_profile_revision=1,
    )
    assert policy.evaluate(top_but_weak).eligible is False


# --------------------------------------------------------------------- 재현성
async def test_recording_enough_metadata_to_reproduce_a_run():
    """프롬프트·모델·정책·설정이 결과와 함께 남아야 같은 조건을 다시 만들 수 있다."""
    _, _, result = await evaluate("E01")
    assert result.prompt_digest and result.inference_digest
    assert result.policy_version
    assert result.model == "scripted-offline"
    assert result.generated_at is not None
    assert result.duration_ms is not None


async def test_the_same_input_twice_gives_the_same_offline_result():
    first = (await evaluate("E01"))[2]
    second = (await evaluate("E01"))[2]
    strip = lambda r: [  # noqa: E731
        (i.candidate_user_id, i.status, i.rank, i.score, i.reason) for i in r.recommendations
    ]
    assert strip(first) == strip(second)
    assert first.inference_digest == second.inference_digest
