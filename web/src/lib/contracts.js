export const LIMITS = { nickname: 20, self_description: 500, connection_intent: 500, text: 2000 };
export const lengthOf = (value) => Array.from(value).length;

export class ApiError extends Error {
  constructor(code, message, { status = 0, fields = {}, retryAfter = 0 } = {}) {
    super(message);
    this.name = 'ApiError';
    Object.assign(this, { code, status, fields, retryAfter });
  }
}

export function validateProfile(values) {
  const labels = { nickname: '닉네임', self_description: '자기소개', connection_intent: '만나고 싶은 사람' };
  return Object.fromEntries(Object.entries(labels).flatMap(([key, label]) => {
    const count = lengthOf((values[key] ?? '').trim());
    return count < 1 || count > LIMITS[key] ? [[key, `${label}는 1~${LIMITS[key]}자로 입력해 주세요.`]] : [];
  }));
}

// Proximity has no join order. The server's last_seen_at decides, and the user ID
// keeps the list stable when two observations share a timestamp.
export const baseOrder = (a, b) => b.last_seen_at.localeCompare(a.last_seen_at) || a.user_id.localeCompare(b.user_id);

// Recommendations never decide who is nearby. v0.1 always reports 'unavailable',
// so every observed user stays listed, ordered by the latest observation.
export function orderNearby(items) {
  const rank = (person) => (person.recommendation?.status === 'ready' ? 0 : 1);
  return [...items].sort((a, b) => rank(a) - rank(b) || baseOrder(a, b));
}

export function mergeMessages(current, incoming) {
  const messages = new Map(current.map((m) => [m.message_id, m]));
  for (const message of incoming) messages.set(message.message_id, message);
  return [...messages.values()].sort((a, b) => a.seq - b.seq);
}

// The server grants first-conversation eligibility for a window after it receives an
// observation. A cached list is for redrawing the screen, never proof of proximity —
// the server re-checks at save time and may still refuse.
export function eligibleForFirstMessage(person, now = Date.now()) {
  if (!person?.conversation_eligibility_expires_at) return false;
  return Date.parse(person.conversation_eligibility_expires_at) > now;
}

// AI-D2: ambiguous input is 'insufficient evidence', never a low score or an error,
// and never a gate. v0.1 evaluates nobody, so this stays silent instead of nagging.
export function needsRicherIntent(items) {
  const evaluated = items.filter((person) => ['ready', 'unscored'].includes(person.recommendation?.status));
  return evaluated.length >= 3 && evaluated.every((person) => person.recommendation.status === 'unscored');
}
