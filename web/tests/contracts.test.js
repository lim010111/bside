import test from 'node:test';
import assert from 'node:assert/strict';
import { lengthOf, validateProfile, orderNearby, mergeMessages, validReason, needsRicherIntent } from '../src/lib/contracts.js';
import { nativeBlocker, UNSUPPORTED } from '../src/lib/native.js';
import { profile } from './helpers.js';

test('Unicode code points and trimmed input match the API limits', () => {
  assert.equal(lengthOf('😀가'), 2);
  assert.deepEqual(validateProfile({ ...profile(), nickname: '😀'.repeat(20) }), {});
  assert.ok(validateProfile({ ...profile(), nickname: '😀'.repeat(21) }).nickname);
  assert.ok(validateProfile({ ...profile(), connection_intent: '  \n ' }).connection_intent);
  assert.deepEqual(validateProfile({ ...profile(), nickname: '' }, true), {});
});
test('unscored people remain visible and stale rankings do not reorder them', () => {
  const items = ['a', 'b', 'c'].map((id) => ({ id, last_observed_at: '2026-09-20T00:00:00Z' }));
  assert.deepEqual(orderNearby(items, { nearby_version: 4, ordered_evaluated_ids: ['c', 'missing'] }, 4).map((p) => p.id), ['c', 'a', 'b']);
  assert.deepEqual(orderNearby(items, { nearby_version: 3, ordered_evaluated_ids: ['c'] }, 4).map((p) => p.id), ['a', 'b', 'c']);
  assert.equal(orderNearby(items, null, 4).length, 3);
});
test('without a ranking the most recently observed person comes first', () => {
  const items = [
    { id: 'old', last_observed_at: '2026-09-20T00:00:00Z' },
    { id: 'fresh', last_observed_at: '2026-09-20T00:05:00Z' },
  ];
  assert.deepEqual(orderNearby(items, null, 1).map((p) => p.id), ['fresh', 'old']);
});
test('send and SSE history are deduplicated by server ID and ordered by sequence', () => {
  assert.deepEqual(mergeMessages([{ id: 'b', seq: 2 }], [{ id: 'a', seq: 1 }, { id: 'b', seq: 2 }]).map((m) => m.id), ['a', 'b']);
});
test('a reason written for another revision of either side is not shown', () => {
  const detail = { person: { profile_revision: 2 }, recommendation: { state: 'ready', reason: 'reason', viewer_profile_revision: 1, candidate_profile_revision: 2 } };
  assert.ok(validReason(detail, { profile_revision: 1 }));
  assert.equal(validReason(detail, { profile_revision: 2 }), false);
  detail.person.profile_revision = 3;
  assert.equal(validReason(detail, { profile_revision: 1 }), false);
});
test('the optional intent hint appears only when nothing evaluated, never as a gate', () => {
  const unscored = (id) => ({ id, evaluation_state: 'unscored' });
  assert.equal(needsRicherIntent([unscored('a'), unscored('b'), unscored('c')]), true);
  assert.equal(needsRicherIntent([unscored('a'), unscored('b'), { id: 'c', evaluation_state: 'ready' }]), false);
  assert.equal(needsRicherIntent([unscored('a'), unscored('b')]), false);
  // Still pending is not the same as insufficient evidence.
  assert.equal(needsRicherIntent([{ id: 'a', evaluation_state: 'pending' }]), false);
});
test('participation intent and the radio state are reported separately', () => {
  assert.equal(nativeBlocker({ ...UNSUPPORTED, supported: true, bluetooth: 'on', permission: 'granted', os: 'ok' }), null);
  assert.equal(nativeBlocker(UNSUPPORTED).level, 'info');
  assert.equal(nativeBlocker({ ...UNSUPPORTED, supported: true, permission: 'denied' }).action, 'permission');
  assert.equal(nativeBlocker({ ...UNSUPPORTED, supported: true, permission: 'granted', bluetooth: 'off' }).level, 'blocked');
  assert.equal(nativeBlocker({ ...UNSUPPORTED, supported: true, permission: 'granted', bluetooth: 'on', os: 'restricted' }).level, 'warn');
});
