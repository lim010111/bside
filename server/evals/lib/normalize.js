// server/docs/ai.md 의 확정 이름을 평가 쪽 표준형으로 받는다.
// 구현이 Pydantic 모델을 JSON으로 내보내면 그대로 이 형태다. 기준선 제공자도 같은 형태를 만든다.
export const STATUSES = ['EVALUATED', 'INSUFFICIENT_EVIDENCE', 'FAILED', 'PENDING'];
export const EXCERPT_SOURCES = [
  'VIEWER_SELF_DESCRIPTION',
  'VIEWER_CONNECTION_INTENT',
  'CANDIDATE_SELF_DESCRIPTION',
  'CANDIDATE_CONNECTION_INTENT',
];

export function emptyRecommendation(candidate, viewer, overrides = {}) {
  return {
    candidate_user_id: candidate.user_id,
    status: 'PENDING',
    rank: null,
    score: null,
    reason: null,
    excerpts: [],
    intent_conflict: false,
    notification_eligible: false,
    failure_code: null,
    viewer_profile_revision: viewer.profile_revision,
    candidate_profile_revision: candidate.profile_revision,
    from_cache: false,
    ...overrides,
  };
}

export function result(request, recommendations, meta = {}) {
  return {
    viewer_user_id: request.viewer.user_id,
    viewer_profile_revision: request.viewer.profile_revision,
    recommendations,
    policy_version: meta.policy_version ?? 'baseline-p1',
    model: meta.model ?? null,
    prompt_digest: meta.prompt_digest ?? null,
    inference_digest: meta.inference_digest ?? null,
    generated_at: meta.generated_at ?? null,
    anomalies: meta.anomalies ?? [],
    cache_hits: meta.cache_hits ?? 0,
    gateway_calls: meta.gateway_calls ?? 0,
    duration_ms: meta.duration_ms ?? null,
  };
}

/**
 * rank 를 1..n 으로 다시 매긴다. EVALUATED 가 아닌 건 rank 를 주지 않는다.
 * 동점은 입력 순서로 깬다. 기존 mock 의 baseOrder(참여 순서)와 같은 성질을 유지하기 위한 것이고,
 * 사전순으로 깨면 기준선이 우연히 유리해지거나 불리해진다.
 */
export function assignRanks(recommendations) {
  const order = new Map(recommendations.map((r, i) => [r.candidate_user_id, i]));
  const scored = recommendations
    .filter((r) => r.status === 'EVALUATED' && typeof r.score === 'number')
    .sort((a, b) => b.score - a.score || order.get(a.candidate_user_id) - order.get(b.candidate_user_id));
  scored.forEach((r, i) => {
    r.rank = i + 1;
  });
  return recommendations;
}
