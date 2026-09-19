import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockApi } from '../src/api/mock.js';
import { fixture, memoryStorage, profile } from './helpers.js';

test('demo joins are idempotent, persist and retain a stopped identity', async () => {
  const { api, storage, me } = await fixture();
  assert.equal((await api.join('KOSS26', profile('다른 이름'))).id, me.id);
  await api.stop('KOSS26');
  const restored = createMockApi({ storage: () => storage });
  assert.equal((await restored.getMe('KOSS26')).id, me.id);
  assert.equal((await restored.join('KOSS26', profile())).participation_status, 'stopped');
  assert.equal((await restored.resume('KOSS26')).id, me.id);
});
test('demo denies prejoin access and unknown rooms; empty rooms have zero candidates', async () => {
  const store = memoryStorage();
  const api = createMockApi({ storage: () => store, seeded: false });
  await assert.rejects(api.getParticipants('KOSS26'), { code: 'PARTICIPATION_REQUIRED' });
  await assert.rejects(api.getRoom('UNKNOWN'), { code: 'NOT_FOUND' });
  await api.ensureSession(); await api.join('KOSS26', profile());
  assert.equal((await api.getParticipants('KOSS26')).items.length, 0);
});
test('profile versions change only for changed content and detect conflicts', async () => {
  const { api, me } = await fixture();
  const same = await api.updateMe('KOSS26', { ...profile(), expected_profile_version: me.profile_version });
  assert.equal(same.profile_version, 1);
  const changed = await api.updateMe('KOSS26', { ...profile(), self_description: '새 소개', expected_profile_version: 1 });
  assert.equal(changed.profile_version, 2);
  await assert.rejects(api.updateMe('KOSS26', { ...profile(), expected_profile_version: 1 }), { code: 'VERSION_CONFLICT' });
});
test('message retry, isolation, stop/resume and closure obey the demo contract', async () => {
  const { api, storage, me } = await fixture();
  const payload = { recipient_id: 'minseo', client_message_id: 'one', text: '안녕하세요' };
  const first = await api.sendMessage('KOSS26', payload);
  assert.equal((await api.sendMessage('KOSS26', payload)).message.id, first.message.id);
  await assert.rejects(api.sendMessage('KOSS26', { ...payload, text: 'changed' }), { code: 'IDEMPOTENCY_CONFLICT' });
  const stranger = createMockApi({ storage: () => storage, sessionKey: 'stranger' });
  await stranger.ensureSession(); await stranger.join('KOSS26', profile('다른 사람'));
  await assert.rejects(stranger.getMessages('KOSS26', first.message.conversation_id), { code: 'NOT_FOUND' });
  await api.stop('KOSS26');
  assert.equal((await api.sendMessage('KOSS26', payload)).replayed, true);
  await assert.rejects(api.sendMessage('KOSS26', { ...payload, client_message_id: 'two' }), { code: 'PARTICIPATION_STOPPED' });
  assert.equal((await api.getMessages('KOSS26', first.message.conversation_id)).items.length, 1);
  assert.equal((await api.resume('KOSS26')).id, me.id);
  await api.sendMessage('KOSS26', { ...payload, client_message_id: 'two' });
  assert.equal((await api.getConversations('KOSS26')).items.length, 1);
  await api.closeRoom('KOSS26');
  await assert.rejects(api.sendMessage('KOSS26', payload), { code: 'ROOM_CLOSED' });
  await assert.rejects(api.getMessages('KOSS26', first.message.conversation_id), { code: 'ROOM_CLOSED' });
});
test('history paginates forward and backward without fabricating incoming messages', async () => {
  const { api } = await fixture();
  let conversation;
  for (let i = 1; i <= 105; i++) conversation = (await api.sendMessage('KOSS26', { recipient_id: 'minseo', client_message_id: String(i), text: String(i) })).message.conversation_id;
  const latest = await api.getMessages('KOSS26', conversation);
  assert.equal(latest.items[0].seq, 56); assert.equal(latest.has_more, true);
  const older = await api.getMessages('KOSS26', conversation, { before_seq: 56 });
  assert.equal(older.items[0].seq, 6); assert.equal(older.items.at(-1).seq, 55);
  const forward = await api.getMessages('KOSS26', conversation, { after_seq: 0 });
  assert.equal(forward.items.at(-1).seq, 50); assert.equal(forward.has_more, true);
});
test('storage failures are explicit instead of pretending to persist', async () => {
  const api = createMockApi({ storage: () => { throw new Error('blocked'); } });
  await assert.rejects(api.ensureSession(), { code: 'STORAGE_UNAVAILABLE' });
});
