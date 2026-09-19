import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiscoveryController } from '../src/discovery-controller.js';
import { ApiError } from '../src/lib/contracts.js';
import { fixture, deferred, until, profile, fakeNative, observed, scan } from './helpers.js';

// The demo radio is wired to the demo server, so the controller runs the real path:
// native scan -> POST /discovery/observations -> observed_users -> screen.
async function setup(t, change = (api) => api, { native: override, withProfile = true } = {}) {
  const data = await fixture({ withProfile });
  const api = change(data.api);
  const native = override ?? data.native;
  const controller = createDiscoveryController({ api, native, credentials: data.credentials });
  t.after(() => controller.dispose());
  await controller.start();
  return { ...data, api, native, controller };
}

test('boot registers the installation once, restores the same user and reuses the request key', async (t) => {
  const { controller, userId, credentials } = await setup(t);
  assert.equal(controller.getState().booting, false);
  assert.equal(controller.getState().me.user_id, userId);
  assert.ok(await credentials.get());
  await controller.start();
  assert.equal(controller.getState().me.user_id, userId, '재시작해도 같은 설치 사용자로 복원된다');
});

test('a fresh install lands on the profile screen instead of an empty nearby list', async (t) => {
  const { controller } = await setup(t, (api) => api, { withProfile: false });
  assert.equal(controller.getState().me.profile, null);
  assert.equal(controller.getState().nearbyLoading, false);
  assert.deepEqual(controller.getState().people, []);
});

test('the nearby list arrives from the native observation report, not from a fetch', async (t) => {
  const native = fakeNative();
  native.setObservations({ observed_users: [observed('minseo', '민서'), observed('yerin', '예린')] });
  const { controller } = await setup(t, (api) => api, { native });
  await until(() => controller.getState().people.length === 2);
  assert.ok(native.calls.includes('start'));
  assert.ok(native.calls.includes('refreshObservations'));
  assert.equal(controller.getState().people[0].recommendation.status, 'unavailable');
  assert.equal(controller.getState().nearbyLoading, false);
});

test('a pushed observation updates the list without a refresh cycle', async (t) => {
  const native = fakeNative();
  const { controller } = await setup(t, (api) => api, { native });
  await until(() => !controller.getState().nearbyLoading);
  native.pushObservations({ observed_users: [observed('late', '늦게')] });
  await until(() => controller.getState().people.length === 1);
  assert.equal(controller.getState().people[0].user_id, 'late');
});

test('detail reads the observation cache; a person who left is reported as gone', async (t) => {
  const native = fakeNative();
  native.setObservations({ observed_users: [observed('minseo', '민서')] });
  const { controller } = await setup(t, (api) => api, { native });
  await until(() => controller.getState().people.length === 1);
  controller.navigate('detail', 'minseo');
  assert.equal(controller.getState().detail.profile.nickname, '민서');
  native.setObservations({ observed_users: [] });
  await controller.refreshAll();
  assert.equal(controller.getState().detail, null, '관측에서 사라지면 상세도 비운다');
});

test('saving the profile replaces it whole and starts discovery on the first save', async (t) => {
  const native = fakeNative();
  const { controller } = await setup(t, (api) => api, { native, withProfile: false });
  const result = await controller.saveProfile(profile('성빈'));
  assert.equal(result.ok, true);
  assert.equal(controller.getState().me.profile.nickname, '성빈');
  assert.equal(controller.getState().view, 'nearby');
  const again = await controller.saveProfile(profile('성빈2'));
  assert.equal(again.ok, true);
  assert.equal(controller.getState().me.profile.nickname, '성빈2');
});

test('field errors from the server come back on the offending input', async (t) => {
  const { controller } = await setup(t, (api) => ({ ...api,
    putProfile: async () => { throw new ApiError('VALIDATION_ERROR', '닉네임을 확인해 주세요.', { fields: { nickname: '닉네임을 확인해 주세요.' } }); },
  }), { withProfile: false });
  const result = await controller.saveProfile(profile());
  assert.equal(result.ok, false);
  assert.equal(result.error.fields.nickname, '닉네임을 확인해 주세요.');
  assert.equal(controller.getState().busy, null);
});

test('discovery OFF clears the list, stops the radio and keeps conversations', async (t) => {
  const native = fakeNative();
  const { controller, api, credentials } = await setup(t, (api) => api, { native });
  const { observed_users } = await api.reportObservations({ identifiers: await scan(api, credentials) });
  native.setObservations({ observed_users });
  await controller.refreshAll();
  await until(() => controller.getState().people.length > 0);
  await api.sendMessage({ recipient_id: observed_users[0].user_id, client_message_id: crypto.randomUUID(), text: '먼저 인사' });
  await controller.refreshAll();
  await until(() => controller.getState().conversations.length === 1);

  await controller.setDiscovery(false);
  await until(() => controller.getState().people.length === 0);
  assert.equal(native.calls.at(-1), 'stop');
  assert.equal(controller.getState().conversations.length, 1, '대화는 그대로 남는다');
});

test('an existing conversation still sends while discovery is off', async (t) => {
  const { controller, api, credentials } = await setup(t);
  const { observed_users } = await api.reportObservations({ identifiers: await scan(api, credentials) });
  const peer = observed_users[0];
  await api.sendMessage({ recipient_id: peer.user_id, client_message_id: crypto.randomUUID(), text: '먼저 인사' });
  await controller.setDiscovery(false);
  await controller.refreshAll();
  controller.navigate('chat', peer.user_id);
  await until(() => controller.getState().conversationId && !controller.getState().chatLoading);
  await controller.send('발견을 꺼도 이어서 보낼 수 있어요');
  assert.equal(controller.getState().outbox[peer.user_id], undefined);
  assert.equal(controller.getState().messages.length, 2);
});

test('a first message to somebody no longer observed fails with the server reason', async (t) => {
  const native = fakeNative();
  native.setObservations({ observed_users: [observed('ghost', '유령')] });
  const { controller } = await setup(t, (api) => api, { native });
  await until(() => controller.getState().people.length === 1);
  controller.navigate('chat', 'ghost');
  await until(() => controller.getState().peer?.user_id === 'ghost');
  await controller.send('처음 보내는 말');
  assert.equal(controller.getState().outbox.ghost.status, 'failed');
  assert.equal(controller.getState().outbox.ghost.error.code, 'RECIPIENT_NOT_FOUND');
});

test('a lost send response retries with the same key and stores exactly one message', async (t) => {
  const calls = [];
  let failOnce = true;
  const { controller, api, credentials } = await setup(t, (api) => ({ ...api,
    sendMessage: async (...args) => {
      calls.push(args[0]);
      const saved = await api.sendMessage(...args);
      if (failOnce) { failOnce = false; throw new ApiError('CONNECTION_FAILED', '응답 유실'); }
      return saved;
    },
  }));
  const { observed_users } = await api.reportObservations({ identifiers: await scan(api, credentials) });
  const peer = observed_users[0];
  await controller.refreshAll();
  controller.navigate('chat', peer.user_id);
  await until(() => !controller.getState().chatLoading);
  controller.setDraft(peer.user_id, '안녕하세요');
  await controller.send('안녕하세요');
  assert.equal(controller.getState().outbox[peer.user_id].status, 'failed');
  assert.equal(controller.getState().drafts[peer.user_id], '안녕하세요');
  await controller.send('안녕하세요', true);
  assert.equal(calls[0].client_message_id, calls[1].client_message_id);
  const conversation = (await api.getConversations()).conversations[0];
  assert.equal((await api.getMessages(conversation.conversation_id)).messages.length, 1);
  assert.equal(controller.getState().drafts[peer.user_id], '');
});

test('late sends do not appear in another conversation', async (t) => {
  const slow = deferred();
  let save;
  const native = fakeNative();
  native.setObservations({ observed_users: [observed('a', '가'), observed('b', '나')] });
  const { controller } = await setup(t, (api) => ({ ...api,
    sendMessage: (...args) => { save = () => api.sendMessage(...args); return slow.promise; },
  }), { native });
  await until(() => controller.getState().people.length === 2);
  controller.navigate('chat', 'a');
  await until(() => controller.getState().peer?.user_id === 'a');
  const pending = controller.send('가에게');
  await until(() => Boolean(save));
  controller.navigate('chat', 'b');
  await until(() => controller.getState().peer?.user_id === 'b');
  slow.resolve({ message_id: 'm', conversation_id: 'c', sender_id: 'me', recipient_id: 'a', seq: 1, text: '가에게', created_at: new Date().toISOString() });
  await pending;
  assert.equal(controller.getState().targetId, 'b');
  assert.equal(controller.getState().messages.length, 0);
});

test('history catch-up pages forward through everything stored while away', async (t) => {
  const { controller, api, credentials } = await setup(t);
  const { observed_users } = await api.reportObservations({ identifiers: await scan(api, credentials) });
  const peer = observed_users[0];
  for (let i = 1; i <= 125; i++) await api.sendMessage({ recipient_id: peer.user_id, client_message_id: crypto.randomUUID(), text: String(i) });
  await controller.refreshAll();
  controller.navigate('chat', peer.user_id);
  await until(() => controller.getState().messages.length === 125);
  assert.equal(controller.getState().messages[0].seq, 1);
  assert.equal(controller.getState().historyCursor, 125);
});

test('a send response never advances the history watermark past an unseen peer message', async (t) => {
  const { controller, api, credentials, userId } = await setup(t);
  const { observed_users } = await api.reportObservations({ identifiers: await scan(api, credentials) });
  const peer = observed_users[0];
  await api.sendMessage({ recipient_id: peer.user_id, client_message_id: crypto.randomUUID(), text: 'first' });
  await controller.refreshAll();
  controller.navigate('chat', peer.user_id);
  await until(() => controller.getState().historyCursor === 1);
  // A message from the peer lands without the controller being told about it.
  api.server._injectPeerMessage(controller.getState().conversationId, peer.user_id);
  await controller.send('my third');
  await until(() => controller.getState().messages.length === 3);
  assert.deepEqual(controller.getState().messages.map((m) => m.seq), [1, 2, 3]);
  assert.equal(controller.getState().messages[1].sender_id, peer.user_id);
  assert.equal(controller.getState().messages[2].sender_id, userId);
});

test('bootstrap failures produce a retry screen, not a half-built session', async (t) => {
  const { controller } = await setup(t, (api) => ({ ...api, getMe: async () => { throw new ApiError('CONNECTION_FAILED', '연결 실패'); } }));
  assert.equal(controller.getState().booting, false);
  assert.equal(controller.getState().bootError.code, 'CONNECTION_FAILED');
  assert.equal(controller.getState().me, null);
});

test('an unauthorized response resets the session instead of looping', async (t) => {
  let fail = false;
  const { controller } = await setup(t, (api) => ({ ...api,
    getMe: async (...args) => { if (fail) throw new ApiError('UNAUTHORIZED', '자격 없음'); return api.getMe(...args); },
  }));
  await until(() => Boolean(controller.getState().me));
  fail = true;
  // refreshAll coalesces into a running pass, so wait for the reset rather than the call.
  void controller.refreshAll();
  await until(() => controller.getState().me === null);
  assert.equal(controller.getState().connection, 'offline');
  assert.equal(controller.getState().people.length, 0);
});

test('double saves are locked so one tap cannot register twice', async (t) => {
  const slow = deferred();
  let calls = 0;
  const { controller } = await setup(t, (api) => ({ ...api,
    putProfile: () => { calls++; return slow.promise; },
  }), { withProfile: false });
  const saving = controller.saveProfile(profile());
  await controller.saveProfile(profile());
  assert.equal(calls, 1);
  slow.resolve(profile());
  await saving;
});

test('a blocked radio does not turn the participation setting off by itself', async (t) => {
  const native = fakeNative();
  const { controller } = await setup(t, (api) => api, { native });
  await until(() => !controller.getState().nearbyLoading);
  native.pushStatus({ bluetooth: 'off', running: false });
  await until(() => controller.getState().native.bluetooth === 'off');
  assert.equal(controller.getState().me.discovery_enabled, true, '권한이 막혀도 의사는 유지된다');
  assert.equal(controller.getState().native.running, false);
});
