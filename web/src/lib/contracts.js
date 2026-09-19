export const LIMITS = { nickname: 20, self_description: 500, connection_intent: 500, text: 2000 };
export const lengthOf = (value) => Array.from(value).length;

export class ApiError extends Error {
  constructor(code, message, { status = 0, fields = {}, retryAfter = 0 } = {}) {
    super(message);
    this.name = 'ApiError';
    Object.assign(this, { code, status, fields, retryAfter });
  }
}

export function validateProfile(values, editing = false) {
  const labels = { nickname: '닉네임', self_description: '자기소개', connection_intent: '찾는 사람' };
  return Object.fromEntries(Object.entries(labels).flatMap(([key, label]) => {
    if (editing && key === 'nickname') return [];
    const count = lengthOf((values[key] ?? '').trim());
    return count < 1 || count > LIMITS[key] ? [[key, `${label}는 1~${LIMITS[key]}자로 입력해 주세요.`]] : [];
  }));
}

export const baseOrder = (a, b) => a.joined_at.localeCompare(b.joined_at) || a.id.localeCompare(b.id);

// Recommendations never determine membership. Unevaluated people remain visible.
export function orderParticipants(items, recommendations, candidateVersion) {
  const ordered = recommendations?.candidate_version === candidateVersion ? recommendations.ordered_evaluated_ids : [];
  const rank = new Map((ordered ?? []).map((id, i) => [id, i]));
  return [...items].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity) || baseOrder(a, b));
}

export function mergeMessages(current, incoming) {
  const messages = new Map(current.map((m) => [m.id, m]));
  for (const message of incoming) messages.set(message.id, message);
  return [...messages.values()].sort((a, b) => a.seq - b.seq);
}

export function validReason(detail, me) {
  const reason = detail?.recommendation;
  return reason?.state === 'ready' && reason.reason
    && reason.viewer_profile_version === me?.profile_version
    && reason.candidate_profile_version === detail.participant.profile_version
    && detail.participant.participation_status === 'active';
}

export function roomCode(location) {
  const match = location.pathname.match(/^\/r\/([^/]+)\/?$/);
  if (match) {
    try { return decodeURIComponent(match[1]); } catch { return match[1]; }
  }
  return new URLSearchParams(location.search).get('r') || 'KOSS26';
}
