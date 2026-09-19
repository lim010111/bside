import test from 'node:test';
import assert from 'node:assert/strict';
import { lengthOf, validateProfile, orderParticipants, mergeMessages, roomCode, validReason } from '../src/lib/contracts.js';
import { profile } from './helpers.js';

test('Unicode code points and trimmed input match the API limits', () => {
  assert.equal(lengthOf('😀가'), 2);
  assert.deepEqual(validateProfile({ ...profile(), nickname: '😀'.repeat(20) }), {});
  assert.ok(validateProfile({ ...profile(), nickname: '😀'.repeat(21) }).nickname);
  assert.ok(validateProfile({ ...profile(), connection_intent: '  \n ' }).connection_intent);
  assert.deepEqual(validateProfile({ ...profile(), nickname: '' }, true), {});
});
test('unscored candidates remain visible and stale rankings do not reorder them', () => {
  const items = ['a', 'b', 'c'].map((id) => ({ id, joined_at: '2026-09-19T00:00:00Z' }));
  assert.deepEqual(orderParticipants(items, { candidate_version: 4, ordered_evaluated_ids: ['c', 'missing'] }, 4).map((p) => p.id), ['c', 'a', 'b']);
  assert.deepEqual(orderParticipants(items, { candidate_version: 3, ordered_evaluated_ids: ['c'] }, 4).map((p) => p.id), ['a', 'b', 'c']);
  assert.equal(orderParticipants(items, null, 4).length, 3);
});
test('send and SSE history are deduplicated by server ID and ordered by sequence', () => {
  assert.deepEqual(mergeMessages([{ id: 'b', seq: 2 }], [{ id: 'a', seq: 1 }, { id: 'b', seq: 2 }]).map((m) => m.id), ['a', 'b']);
});
test('stale profile reasons and stopped candidates are not shown', () => {
  const detail = { participant: { profile_version: 2, participation_status: 'active' }, recommendation: { state: 'ready', reason: 'reason', viewer_profile_version: 1, candidate_profile_version: 2 } };
  assert.ok(validReason(detail, { profile_version: 1 }));
  assert.equal(validReason(detail, { profile_version: 2 }), false);
  detail.participant.participation_status = 'stopped';
  assert.equal(validReason(detail, { profile_version: 1 }), false);
});
test('supports prepared /r/ links and legacy ?r= links', () => {
  assert.equal(roomCode({ pathname: '/r/room%20one', search: '?r=ignored' }), 'room one');
  assert.equal(roomCode({ pathname: '/', search: '?r=FEMEETUP' }), 'FEMEETUP');
});
