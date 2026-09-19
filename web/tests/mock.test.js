import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockApi } from '../src/api/mock.js';
import { ROOMS } from '../src/api/seeds.js';
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

// 추천이 0명으로 주저앉는 회귀를 막는다. 어미 활용형 하나(`막힌`)를 빠뜨려
// 씨드 45명이 한 명도 추천되지 않은 적이 있고, 그때 계약 테스트는 전부 통과했다.
// 계약이 맞는지와 결과가 나오는지는 다른 질문이다.
const viewer = (connection_intent) => ({
  nickname: '테스터', self_description: '배포하다가 막혔어요. 도커 좀 아시는 분', connection_intent,
});
async function joinFresh(payload) {
  const storage = memoryStorage();
  const api = createMockApi({ storage: () => storage });
  await api.ensureSession();
  await api.join('KOSS26', payload);
  return api;
}
test('demo recommends someone for intents a real participant would type', async () => {
  const intents = [
    '사이드 프로젝트를 만드는 사람과 시행착오를 나누고 싶어요.',
    '비슷한 걸 겪고 있거나 막힌 분이 있으면 편하게 물어봐 주세요',
    '지금 막힌 걸 같이 풀어줄 수 있는 분과 편하게 얘기하고 싶어요',
    '배포 관련해서 조언 좀 얻고 싶어요',
  ];
  for (const intent of intents) {
    const api = await joinFresh(viewer(intent));
    const { ordered_evaluated_ids } = await api.getRecommendations('KOSS26');
    assert.ok(ordered_evaluated_ids.length > 0, `추천이 0명이다: "${intent}"`);
  }
});
test('demo seeds are written so that most participants get recommendations', async () => {
  const people = ROOMS.KOSS26.seed();
  let scored = 0;
  for (const person of people) {
    const api = await joinFresh({ nickname: person.name + '2', self_description: person.self, connection_intent: person.intent });
    if ((await api.getRecommendations('KOSS26')).ordered_evaluated_ids.length) scored++;
  }
  // 남는 사람들은 "꼭 정해진 주제 아니어도" 류로 의도가 비어 있다. 비워두는 게 맞다.
  assert.ok(scored >= people.length * 0.7, `${scored}/${people.length}명만 추천을 받았다`);
});
test('recommendation reasons quote the other person rather than inventing one', async () => {
  const { api } = await fixture();
  const { ordered_evaluated_ids } = await api.getRecommendations('KOSS26');
  assert.ok(ordered_evaluated_ids.length > 0);
  const detail = await api.getParticipant('KOSS26', ordered_evaluated_ids[0]);
  assert.equal(detail.recommendation.state, 'ready');
  assert.ok(detail.recommendation.reason.includes(detail.participant.self_description),
    '이유가 상대의 원문을 담고 있지 않다: ' + detail.recommendation.reason);
});
