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
  const labels = { nickname: '닉네임', self_description: '자기소개', connection_intent: '만나고 싶은 사람' };
  return Object.fromEntries(Object.entries(labels).flatMap(([key, label]) => {
    if (editing && key === 'nickname') return [];
    const count = lengthOf((values[key] ?? '').trim());
    return count < 1 || count > LIMITS[key] ? [[key, `${label}는 1~${LIMITS[key]}자로 입력해 주세요.`]] : [];
  }));
}

// Proximity has no join order. The most recent valid observation wins, then the ID
// keeps the list stable while observations of the same second arrive out of order.
export const baseOrder = (a, b) => b.last_observed_at.localeCompare(a.last_observed_at) || a.id.localeCompare(b.id);

// Recommendations never determine who is nearby. Unevaluated people remain visible.
export function orderNearby(items, recommendations, nearbyVersion) {
  const ordered = recommendations?.nearby_version === nearbyVersion ? recommendations.ordered_evaluated_ids : [];
  const rank = new Map((ordered ?? []).map((id, i) => [id, i]));
  return [...items].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity) || baseOrder(a, b));
}

export function mergeMessages(current, incoming) {
  const messages = new Map(current.map((m) => [m.id, m]));
  for (const message of incoming) messages.set(message.id, message);
  return [...messages.values()].sort((a, b) => a.seq - b.seq);
}

// A reason is written for one viewer against one revision pair. Once either side
// edits their text the old sentence no longer cites what is on screen.
export function validReason(detail, me) {
  const reason = detail?.recommendation;
  return reason?.state === 'ready' && reason.reason
    && reason.viewer_profile_revision === me?.profile_revision
    && reason.candidate_profile_revision === detail.person.profile_revision;
}

// AI-D2: ambiguous input is 'insufficient evidence', never a low score or an error,
// and never a gate. The hint is optional and the list and chat stay usable.
export function needsRicherIntent(items) {
  const evaluated = items.filter((person) => person.evaluation_state !== 'pending');
  return evaluated.length >= 3 && evaluated.every((person) => person.evaluation_state === 'unscored');
}
