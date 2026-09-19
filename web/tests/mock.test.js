import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoClient } from '../src/api/demo.js';
import { createCredentialStore } from '../src/lib/credentials.js';
import { ELIGIBILITY_WINDOW, IDENTIFIER_TTL } from '../src/api/mock.js';
import { fixture, memoryStorage, profile, scan } from './helpers.js';

test('a retried registration replays the original credential instead of a second install', async () => {
  const storage = memoryStorage();
  const credentials = createCredentialStore({ storage: () => storage });
  const api = createDemoClient({ credentials, storage: () => storage });
  const request = { installation_request_id: credentials.installRequestId(), platform: 'android' };
  const first = await api.registerInstallation(request);
  const retry = await api.registerInstallation(request);
  assert.equal(retry.user_id, first.user_id);
  assert.equal(retry.installation_credential, first.installation_credential);
  await assert.rejects(api.registerInstallation({ installation_request_id: 'not-a-uuid', platform: 'android' }), { code: 'VALIDATION_ERROR' });
  await assert.rejects(api.registerInstallation({ installation_request_id: credentials.installRequestId(), platform: 'ios' }), { code: 'VALIDATION_ERROR' });
});
test('a replayed registration key expires instead of minting a new credential', async () => {
  let clock = Date.parse('2026-09-20T00:00:00Z');
  const storage = memoryStorage();
  const credentials = createCredentialStore({ storage: () => storage });
  const api = createDemoClient({ credentials, storage: () => storage, now: () => clock });
  const request = { installation_request_id: credentials.installRequestId(), platform: 'android' };
  await api.registerInstallation(request);
  clock += 600001;
  await assert.rejects(api.registerInstallation(request), { code: 'IDEMPOTENCY_REPLAY_EXPIRED' });
});
test('calls without a credential are unauthorized, and a new install has no profile', async () => {
  const storage = memoryStorage();
  const credentials = createCredentialStore({ storage: () => storage });
  const api = createDemoClient({ credentials, storage: () => storage });
  await assert.rejects(api.getMe(), { code: 'UNAUTHORIZED' });
  const installation = await api.registerInstallation({ installation_request_id: credentials.installRequestId(), platform: 'android' });
  await credentials.set(installation.installation_credential);
  const me = await api.getMe();
  assert.equal(me.profile, null);
  assert.equal(me.discovery_enabled, false);
});
test('the profile is replaced whole and identical values are a successful no-op', async () => {
  const { api } = await fixture();
  const stored = await api.putProfile({ ...profile(), nickname: '바뀐이름' });
  assert.equal(stored.nickname, '바뀐이름');
  assert.deepEqual(await api.putProfile({ ...profile(), nickname: '바뀐이름' }), stored);
  await assert.rejects(api.putProfile({ ...profile(), self_description: '' }), (error) => error.code === 'VALIDATION_ERROR' && Boolean(error.fields.self_description));
});
test('identifiers rotate on the server clock and the replaced one overlaps until its own expiry', async () => {
  let clock = Date.parse('2026-09-20T00:00:00Z');
  const { api } = await fixture({ clock: () => clock });
  const first = await api.issueIdentifier();
  assert.match(first.identifier, /^[A-Za-z0-9_-]{22}$/);
  assert.deepEqual(await api.issueIdentifier(), first, '갱신 시점 전에는 같은 ID를 돌려준다');
  clock += IDENTIFIER_TTL - 60000;
  const rotated = await api.issueIdentifier();
  assert.notEqual(rotated.identifier, first.identifier);
});
test('discovery must be on and a profile present before an identifier is issued', async () => {
  const { api } = await fixture({ withProfile: false });
  await assert.rejects(api.issueIdentifier(), { code: 'PROFILE_REQUIRED' });
  await api.putProfile(profile());
  await assert.rejects(api.issueIdentifier(), { code: 'DISCOVERY_DISABLED' });
  await api.setDiscovery({ enabled: true });
  assert.ok((await api.issueIdentifier()).identifier);
});
test('observations resolve identifiers to public profiles and ignore junk without failing the batch', async () => {
  const { api, credentials } = await fixture();
  const identifiers = await scan(api, credentials);
  assert.ok(identifiers.length > 0);
  const { observed_users } = await api.reportObservations({ identifiers: [...identifiers.slice(0, 3), 'AAAAAAAAAAAAAAAAAAAAAA'] });
  assert.equal(observed_users.length, 3);
  assert.equal(observed_users[0].recommendation.status, 'unavailable', 'v0.1 추천은 항상 unavailable이다');
  assert.ok(observed_users[0].profile.nickname);
  assert.ok(observed_users[0].conversation_eligibility_expires_at);
  await assert.rejects(api.reportObservations({ identifiers: [] }), { code: 'VALIDATION_ERROR' });
  await assert.rejects(api.reportObservations({ identifiers: new Array(51).fill('AAAAAAAAAAAAAAAAAAAAAA') }), { code: 'VALIDATION_ERROR' });
});
test('discovery off yields no observations and blocks a first message, never an existing one', async () => {
  const { api, credentials } = await fixture();
  const { observed_users } = await api.reportObservations({ identifiers: await scan(api, credentials) });
  const peer = observed_users[0], other = observed_users[1];
  const first = await api.sendMessage({ recipient_id: peer.user_id, client_message_id: crypto.randomUUID(), text: '안녕하세요' });
  assert.equal(first.seq, 1);
  await api.setDiscovery({ enabled: false });
  assert.deepEqual((await api.reportObservations({ identifiers: ['AAAAAAAAAAAAAAAAAAAAAA'] })).observed_users, []);
  // Existing conversation: still sendable. New relationship: refused.
  const second = await api.sendMessage({ recipient_id: peer.user_id, client_message_id: crypto.randomUUID(), text: '이어서' });
  assert.equal(second.seq, 2);
  await assert.rejects(api.sendMessage({ recipient_id: other.user_id, client_message_id: crypto.randomUUID(), text: '처음' }), { code: 'DISCOVERY_DISABLED' });
});
test('an expired observation refuses a first message but keeps the conversation', async () => {
  let clock = Date.parse('2026-09-20T00:00:00Z');
  const { api, credentials } = await fixture({ clock: () => clock });
  const { observed_users } = await api.reportObservations({ identifiers: await scan(api, credentials) });
  const peer = observed_users[0], other = observed_users[1];
  const sent = await api.sendMessage({ recipient_id: peer.user_id, client_message_id: crypto.randomUUID(), text: '안녕하세요' });
  clock += ELIGIBILITY_WINDOW + 1000;
  await assert.rejects(api.sendMessage({ recipient_id: other.user_id, client_message_id: crypto.randomUUID(), text: '처음' }), { code: 'OBSERVATION_REQUIRED' });
  assert.equal((await api.getMessages(sent.conversation_id)).messages.length, 1);
  assert.equal((await api.getConversations()).conversations.length, 1);
});
test('the same message key replays the original and a changed one conflicts', async () => {
  const { api, credentials } = await fixture();
  const { observed_users } = await api.reportObservations({ identifiers: await scan(api, credentials) });
  const key = crypto.randomUUID();
  const payload = { recipient_id: observed_users[0].user_id, client_message_id: key, text: '안녕하세요' };
  const first = await api.sendMessage(payload);
  assert.equal((await api.sendMessage(payload)).message_id, first.message_id);
  await assert.rejects(api.sendMessage({ ...payload, text: '다른 내용' }), { code: 'IDEMPOTENCY_CONFLICT' });
  await assert.rejects(api.sendMessage({ ...payload, recipient_id: observed_users[1].user_id }), { code: 'IDEMPOTENCY_CONFLICT' });
  assert.equal(first.client_message_id, undefined, '중복 방지 키는 공개 메시지 모양이 아니다');
  await assert.rejects(api.sendMessage({ ...payload, client_message_id: 'not-a-uuid' }), { code: 'VALIDATION_ERROR' });
  await assert.rejects(api.sendMessage({ recipient_id: 'nobody', client_message_id: crypto.randomUUID(), text: 'x' }), { code: 'RECIPIENT_NOT_FOUND' });
});
test('history pages forward only and a non-participant cannot read a conversation', async () => {
  const { api, credentials } = await fixture();
  const { observed_users } = await api.reportObservations({ identifiers: await scan(api, credentials) });
  let conversation;
  for (let i = 1; i <= 105; i++) {
    conversation = (await api.sendMessage({ recipient_id: observed_users[0].user_id, client_message_id: crypto.randomUUID(), text: String(i) })).conversation_id;
  }
  const page = await api.getMessages(conversation);
  assert.equal(page.messages[0].seq, 1);
  assert.equal(page.messages.length, 50);
  assert.equal(page.has_more, true);
  assert.equal(page.next_after_seq, 50);
  const last = await api.getMessages(conversation, { after_seq: 100 });
  assert.equal(last.messages.length, 5);
  assert.equal(last.has_more, false);
  assert.equal(last.next_after_seq, null);
  await assert.rejects(api.getMessages(conversation, { limit: 101 }), { code: 'VALIDATION_ERROR' });
  await assert.rejects(api.getMessages('unknown-conversation'), { code: 'CONVERSATION_NOT_FOUND' });
});
test('storage failures are explicit instead of pretending to persist', async () => {
  const credentials = createCredentialStore({ storage: () => { throw new Error('blocked'); } });
  const api = createDemoClient({ credentials, storage: () => { throw new Error('blocked'); } });
  await assert.rejects(api.registerInstallation({ installation_request_id: crypto.randomUUID(), platform: 'android' }), { code: 'STORAGE_UNAVAILABLE' });
});
