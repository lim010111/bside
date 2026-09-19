import test from 'node:test';
import assert from 'node:assert/strict';
import { lengthOf, validateProfile, orderNearby, mergeMessages, eligibleForFirstMessage, needsRicherIntent } from '../src/lib/contracts.js';
import { nativeBlocker, UNSUPPORTED } from '../src/lib/native.js';
import { profile, observed } from './helpers.js';

test('Unicode code points and trimmed input match the API limits', () => {
  assert.equal(lengthOf('😀가'), 2);
  assert.deepEqual(validateProfile({ ...profile(), nickname: '😀'.repeat(20) }), {});
  assert.ok(validateProfile({ ...profile(), nickname: '😀'.repeat(21) }).nickname);
  assert.ok(validateProfile({ ...profile(), connection_intent: '  \n ' }).connection_intent);
  // The contract replaces the whole profile, so nickname is always required.
  assert.ok(validateProfile({ ...profile(), nickname: '' }).nickname);
});
test('without ranks the most recently observed person comes first', () => {
  const items = [
    observed('old', '오래', { last_seen_at: '2026-09-20T00:00:00Z' }),
    observed('fresh', '최근', { last_seen_at: '2026-09-20T00:05:00Z' }),
  ];
  assert.deepEqual(orderNearby(items).map((p) => p.user_id), ['fresh', 'old']);
  assert.equal(orderNearby(items).length, 2, '추천이 없다고 목록에서 빠지지 않는다');
});
test("the server's rank decides the order, and nobody drops out of the list", () => {
  // The server ranks the whole response: a pending person still gets a position.
  const rank = (id, position, status, last_seen_at) =>
    observed(id, id, { recommendation: { status, rank: position }, last_seen_at });
  const items = [
    rank('pending', 2, 'pending', '2026-09-20T00:09:00Z'),
    rank('best', 0, 'ready', '2026-09-20T00:00:00Z'),
    rank('quiet', 1, 'unscored', '2026-09-20T00:05:00Z'),
  ];
  assert.deepEqual(orderNearby(items).map((p) => p.user_id), ['best', 'quiet', 'pending'],
    '가장 최근 관측이 아니라 서버 순위를 따른다');
  assert.equal(orderNearby(items).length, 3, '평가 전이라고 목록에서 빠지지 않는다');
});
test('a rank of 0 is a position, not a missing value', () => {
  // `rank || fallback` would silently demote the top recommendation.
  const items = [
    observed('second', '둘', { recommendation: { status: 'ready', rank: 1 }, last_seen_at: '2026-09-20T00:09:00Z' }),
    observed('first', '하나', { recommendation: { status: 'ready', rank: 0 }, last_seen_at: '2026-09-20T00:00:00Z' }),
  ];
  assert.deepEqual(orderNearby(items).map((p) => p.user_id), ['first', 'second']);
});
test('send and history are deduplicated by server message_id and ordered by seq', () => {
  assert.deepEqual(mergeMessages([{ message_id: 'b', seq: 2 }], [{ message_id: 'a', seq: 1 }, { message_id: 'b', seq: 2 }]).map((m) => m.message_id), ['a', 'b']);
});
test('first-message eligibility follows the server window, not the client clock', () => {
  const now = Date.parse('2026-09-20T00:00:00Z');
  assert.equal(eligibleForFirstMessage(observed('a', '가', { conversation_eligibility_expires_at: '2026-09-20T00:05:00Z' }), now), true);
  assert.equal(eligibleForFirstMessage(observed('a', '가', { conversation_eligibility_expires_at: '2026-09-19T23:59:00Z' }), now), false);
  assert.equal(eligibleForFirstMessage(null, now), false);
});
test('the optional intent hint stays silent while v0.1 evaluates nobody', () => {
  const unavailable = ['a', 'b', 'c'].map((id) => observed(id, id));
  assert.equal(needsRicherIntent(unavailable), false, 'unavailable은 근거 부족이 아니다');
  const unscored = unavailable.map((person) => ({ ...person, recommendation: { status: 'unscored' } }));
  assert.equal(needsRicherIntent(unscored), true);
  unscored[0].recommendation = { status: 'ready' };
  assert.equal(needsRicherIntent(unscored), false);
});
test('participation intent and the radio state are reported separately', () => {
  assert.equal(nativeBlocker({ ...UNSUPPORTED, supported: true, bluetooth: 'on', permission: 'granted', os: 'ok' }), null);
  assert.equal(nativeBlocker(UNSUPPORTED).level, 'info');
  assert.match(nativeBlocker({ ...UNSUPPORTED, supported: true, simulated: true }).text, /실제 BLE 발견이 아니에요/);
  assert.equal(nativeBlocker({ ...UNSUPPORTED, supported: true, permission: 'denied' }).action, 'permission');
  assert.equal(nativeBlocker({ ...UNSUPPORTED, supported: true, permission: 'granted', bluetooth: 'off' }).level, 'blocked');
  assert.equal(nativeBlocker({ ...UNSUPPORTED, supported: true, permission: 'granted', bluetooth: 'on', os: 'restricted' }).level, 'warn');
});
