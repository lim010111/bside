import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockApi, OBSERVATION_TTL } from '../src/api/mock.js';
import { SEED_NEARBY } from '../src/api/seeds.js';
import { fixture, memoryStorage, profile } from './helpers.js';

test('demo profile creation is idempotent, persists and keeps discovery OFF across restarts', async () => {
  const { api, storage, me } = await fixture();
  assert.equal((await api.createProfile(profile('다른 이름'))).user_id, me.user_id);
  await api.setDiscovery({ enabled: false });
  const restored = createMockApi({ storage: () => storage });
  assert.equal((await restored.getMe()).user_id, me.user_id);
  assert.equal((await restored.createProfile(profile())).discovery_enabled, false);
  assert.equal((await restored.setDiscovery({ enabled: true })).user_id, me.user_id);
});
test('demo denies access before a profile exists; an empty world has nobody nearby', async () => {
  const store = memoryStorage();
  const api = createMockApi({ storage: () => store, seeded: false });
  await assert.rejects(api.getNearby(), { code: 'PROFILE_REQUIRED' });
  await api.registerInstall(); await api.createProfile(profile());
  assert.equal((await api.getNearby()).items.length, 0);
});
test('profile revisions change only for changed content and detect conflicts', async () => {
  const { api, me } = await fixture();
  const same = await api.updateProfile({ ...profile(), expected_profile_revision: me.profile_revision });
  assert.equal(same.profile_revision, 1);
  const changed = await api.updateProfile({ ...profile(), self_description: '새 소개', expected_profile_revision: 1 });
  assert.equal(changed.profile_revision, 2);
  await assert.rejects(api.updateProfile({ ...profile(), expected_profile_revision: 1 }), { code: 'REVISION_CONFLICT' });
});
test('discovery revisions guard a concurrent ON/OFF', async () => {
  const { api } = await fixture();
  await api.setDiscovery({ enabled: false, expected_discovery_revision: 1 });
  await assert.rejects(api.setDiscovery({ enabled: true, expected_discovery_revision: 1 }), { code: 'REVISION_CONFLICT' });
  assert.equal((await api.setDiscovery({ enabled: true, expected_discovery_revision: 2 })).discovery_enabled, true);
});
test('a first message needs current proximity but an existing conversation never re-checks it', async () => {
  const { api, storage, me } = await fixture();
  const payload = { recipient_id: 'minseo', client_message_id: 'one', text: '안녕하세요' };
  const first = await api.sendMessage(payload);
  assert.equal((await api.sendMessage(payload)).message.id, first.message.id);
  await assert.rejects(api.sendMessage({ ...payload, text: 'changed' }), { code: 'IDEMPOTENCY_CONFLICT' });
  const stranger = createMockApi({ storage: () => storage, installKey: 'stranger' });
  await stranger.registerInstall(); await stranger.createProfile(profile('다른 사람'));
  await assert.rejects(stranger.getMessages(first.message.conversation_id), { code: 'NOT_FOUND' });
  await api.setDiscovery({ enabled: false });
  // Existing conversation: still sendable. New relationship: refused.
  await api.sendMessage({ ...payload, client_message_id: 'two', text: '이어서' });
  await assert.rejects(api.sendMessage({ recipient_id: 'yerin', client_message_id: 'three', text: '처음' }), { code: 'DISCOVERY_OFF' });
  assert.equal((await api.getMessages(first.message.conversation_id)).items.length, 2);
  assert.equal((await api.setDiscovery({ enabled: true })).user_id, me.user_id);
  assert.equal((await api.getConversations()).items.length, 1);
});
test('a conversation survives the other person leaving proximity', async () => {
  let clock = Date.parse('2026-09-20T00:00:00Z');
  const { api } = await fixture({ clock: () => clock });
  const sent = await api.sendMessage({ recipient_id: 'minseo', client_message_id: 'one', text: '안녕하세요' });
  await api.setDiscovery({ enabled: false });
  clock += OBSERVATION_TTL * 2;
  assert.equal((await api.getNearby()).items.length, 0);
  await assert.rejects(api.getPerson('minseo'), { code: 'OBSERVATION_EXPIRED' });
  const conversations = await api.getConversations();
  assert.equal(conversations.items.length, 1);
  assert.equal(conversations.items[0].peer_nearby, false);
  assert.equal((await api.getMessages(sent.message.conversation_id)).items.length, 1);
});
test('observation reports are refused while discovery is off', async () => {
  const { api } = await fixture();
  assert.ok((await api.reportObservations({ observations: [] })).nearby_version > 0);
  await api.setDiscovery({ enabled: false });
  await assert.rejects(api.reportObservations({ observations: [] }), { code: 'DISCOVERY_OFF' });
});
test('history paginates forward and backward without fabricating incoming messages', async () => {
  const { api } = await fixture();
  let conversation;
  for (let i = 1; i <= 105; i++) conversation = (await api.sendMessage({ recipient_id: 'minseo', client_message_id: String(i), text: String(i) })).message.conversation_id;
  const latest = await api.getMessages(conversation);
  assert.equal(latest.items[0].seq, 56); assert.equal(latest.has_more, true);
  const older = await api.getMessages(conversation, { before_seq: 56 });
  assert.equal(older.items[0].seq, 6); assert.equal(older.items.at(-1).seq, 55);
  const forward = await api.getMessages(conversation, { after_seq: 0 });
  assert.equal(forward.items.at(-1).seq, 50); assert.equal(forward.has_more, true);
});
test('storage failures are explicit instead of pretending to persist', async () => {
  const api = createMockApi({ storage: () => { throw new Error('blocked'); } });
  await assert.rejects(api.registerInstall(), { code: 'STORAGE_UNAVAILABLE' });
});

// 추천이 0명으로 주저앉는 회귀를 막는다. 어미 활용형 하나(`막힌`)를 빠뜨려
// 씨드 45명이 한 명도 추천되지 않은 적이 있고, 그때 계약 테스트는 전부 통과했다.
// 계약이 맞는지와 결과가 나오는지는 다른 질문이다.
const viewer = (connection_intent) => ({
  nickname: '테스터', self_description: '배포하다가 막혔어요. 도커 좀 아시는 분', connection_intent,
});
async function startFresh(payload) {
  const storage = memoryStorage();
  const api = createMockApi({ storage: () => storage });
  await api.registerInstall();
  await api.createProfile(payload);
  return api;
}
test('demo recommends someone for intents a real person would type', async () => {
  const intents = [
    '사이드 프로젝트를 만드는 사람과 시행착오를 나누고 싶어요.',
    '비슷한 걸 겪고 있거나 막힌 분이 있으면 편하게 물어봐 주세요',
    '지금 막힌 걸 같이 풀어줄 수 있는 분과 편하게 얘기하고 싶어요',
    '배포 관련해서 조언 좀 얻고 싶어요',
  ];
  for (const intent of intents) {
    const api = await startFresh(viewer(intent));
    const { ordered_evaluated_ids } = await api.getRecommendations();
    assert.ok(ordered_evaluated_ids.length > 0, `추천이 0명이다: "${intent}"`);
  }
});
test('demo seeds are written so that most people get recommendations', async () => {
  let scored = 0;
  for (const person of SEED_NEARBY) {
    const api = await startFresh({ nickname: person.name + '2', self_description: person.self, connection_intent: person.intent });
    if ((await api.getRecommendations()).ordered_evaluated_ids.length) scored++;
  }
  // 남는 사람들은 "꼭 정해진 주제 아니어도" 류로 의도가 비어 있다. 비워두는 게 맞다.
  assert.ok(scored >= SEED_NEARBY.length * 0.7, `${scored}/${SEED_NEARBY.length}명만 추천을 받았다`);
});
test('recommendation reasons quote the other person rather than inventing one', async () => {
  const { api } = await fixture();
  const { ordered_evaluated_ids } = await api.getRecommendations();
  assert.ok(ordered_evaluated_ids.length > 0);
  const detail = await api.getPerson(ordered_evaluated_ids[0]);
  assert.equal(detail.recommendation.state, 'ready');
  assert.ok(detail.recommendation.reason.includes(detail.person.self_description),
    '이유가 상대의 원문을 담고 있지 않다: ' + detail.recommendation.reason);
});

// `안 해봤어요`는 `해봤`을 품는다. 부정을 읽지 못하면 못 한다고 쓴 사람을
// 근거로 추천하게 되고, 심사위원이 그 사람을 눌러보면 바로 드러난다.
test('demo never recommends someone on the strength of what they said they cannot do', async () => {
  const api = await startFresh(viewer('배포나 발표 해보신 분과 이야기하고 싶어요'));
  const { ordered_evaluated_ids } = await api.getRecommendations();
  assert.ok(ordered_evaluated_ids.length > 0);
  for (const id of ordered_evaluated_ids) {
    const { person } = await api.getPerson(id);
    assert.doesNotMatch(person.self_description, /안 해봤|한 번도|할 줄 아는 게 별로 없/,
      '못 한다고 쓴 사람을 추천했다: ' + person.self_description);
  }
});
