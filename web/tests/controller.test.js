import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiscoveryController } from '../src/discovery-controller.js';
import { ApiError } from '../src/lib/contracts.js';
import { fixture, deferred, until, profile, fakeNative, STATE_KEY } from './helpers.js';

async function setup(t, change = (api) => api, { native } = {}) {
  const data = await fixture();
  const api = change(data.api);
  const controller = createDiscoveryController({ api, native });
  t.after(() => controller.dispose());
  await controller.start();
  return { ...data, api, controller };
}

test('waits for SSE ready before protected lists, then loads nearby despite recommendation failure', async (t) => {
  let event, listCalls = 0;
  const { controller } = await setup(t, (api) => ({ ...api,
    subscribe: (callback) => { event = callback; return () => {}; },
    getNearby: (...args) => { listCalls++; return api.getNearby(...args); },
    getRecommendations: async () => { throw new ApiError('FAILED', '추천 실패'); },
  }));
  assert.equal(listCalls, 0);
  event({ type: 'ready', data: { nearby_version: 1 } });
  await until(() => controller.getState().recommendationState === 'failed');
  assert.ok(controller.getState().people.length > 0);
  assert.equal(controller.getState().nearbyLoading, false);
});

test('profile change invalidates stale reasons, keeps the user ID, and discovery ON/OFF round-trips', async (t) => {
  const { controller, me } = await setup(t);
  await until(() => !controller.getState().nearbyLoading);
  const updated = await controller.mutate('updateProfile', { ...profile(), self_description: '디자인 공부 중', expected_profile_revision: 1 });
  assert.equal(updated.ok, true);
  assert.equal(controller.getState().me.user_id, me.user_id);
  assert.equal(controller.getState().me.profile_revision, 2);
  await controller.setDiscovery(false);
  assert.equal(controller.getState().me.discovery_enabled, false);
  await controller.setDiscovery(true);
  assert.equal(controller.getState().me.discovery_enabled, true);
});

test('an old person response cannot overwrite the newly selected person', async (t) => {
  const slow = deferred();
  let started = false;
  const { controller } = await setup(t, (api) => ({ ...api,
    getPerson: (id, options) => id === 'minseo' ? (started = true, slow.promise) : api.getPerson(id, options),
  }));
  await until(() => !controller.getState().nearbyLoading);
  controller.navigate('detail', 'minseo');
  await until(() => started);
  controller.navigate('detail', 'yerin');
  await until(() => controller.getState().detail?.person.id === 'yerin');
  slow.resolve({ person: { id: 'minseo', nickname: '민서', profile_revision: 1 }, recommendation: null });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.getState().detail.person.id, 'yerin');
  assert.equal(controller.getState().targetId, 'yerin');
});

test('a lost send response retries with the same ID and stores exactly one message', async (t) => {
  const calls = [];
  let failOnce = true;
  const { controller, api } = await setup(t, (api) => ({ ...api,
    sendMessage: async (...args) => {
      calls.push(args[0]);
      const saved = await api.sendMessage(...args);
      if (failOnce) { failOnce = false; throw new ApiError('CONNECTION_FAILED', '응답 유실'); }
      return saved;
    },
  }));
  await until(() => !controller.getState().nearbyLoading);
  controller.navigate('chat', 'minseo');
  await until(() => !controller.getState().chatLoading && controller.getState().peer);
  controller.setDraft('minseo', '안녕하세요');
  await controller.send('안녕하세요');
  assert.equal(controller.getState().outbox.minseo.status, 'failed');
  assert.equal(controller.getState().drafts.minseo, '안녕하세요');
  await controller.send('안녕하세요', true);
  assert.equal(calls[0].client_message_id, calls[1].client_message_id);
  const conversation = (await api.getConversations()).items[0];
  assert.equal((await api.getMessages(conversation.id)).items.length, 1);
  assert.equal(controller.getState().drafts.minseo, '');
});

test('late sends do not appear in another conversation', async (t) => {
  const slow = deferred();
  let save;
  const { controller } = await setup(t, (api) => ({ ...api,
    sendMessage: (...args) => { save = () => api.sendMessage(...args); return slow.promise; },
  }));
  await until(() => !controller.getState().nearbyLoading);
  controller.navigate('chat', 'minseo');
  await until(() => controller.getState().peer?.id === 'minseo' && !controller.getState().chatLoading);
  const pending = controller.send('민서에게');
  await until(() => Boolean(save));
  controller.navigate('chat', 'yerin');
  await until(() => controller.getState().peer?.id === 'yerin' && !controller.getState().chatLoading);
  slow.resolve(await save()); await pending;
  assert.equal(controller.getState().targetId, 'yerin');
  assert.equal(controller.getState().messages.length, 0);
});

test('history catch-up fetches every page after a disconnected period', async (t) => {
  let deliver = true;
  const { controller, api } = await setup(t, (api) => ({ ...api,
    subscribe: (callback, onError) => api.subscribe((event) => { if (deliver) callback(event); }, onError),
  }));
  await until(() => !controller.getState().nearbyLoading);
  await api.sendMessage({ recipient_id: 'minseo', client_message_id: 'initial', text: 'first' });
  controller.navigate('chat', 'minseo');
  await until(() => controller.getState().historyCursor === 1);
  // Store messages without delivering change notifications to this controller.
  deliver = false;
  for (let i = 2; i <= 125; i++) await api.sendMessage({ recipient_id: 'minseo', client_message_id: String(i), text: String(i) });
  deliver = true;
  await controller.refreshAll();
  await until(() => controller.getState().historyCursor === 125);
  assert.equal(controller.getState().messages.length, 125);
  assert.equal(controller.getState().messages[0].seq, 1);
  assert.equal(controller.getState().hasOlder, false);
});

test('discovery OFF empties the nearby list but keeps conversations and sending', async (t) => {
  const { controller, api } = await setup(t);
  await until(() => !controller.getState().nearbyLoading);
  await api.sendMessage({ recipient_id: 'minseo', client_message_id: 'hello', text: '먼저 인사' });
  await controller.setDiscovery(false);
  await until(() => controller.getState().people.length === 0);
  assert.equal(controller.getState().conversations.length, 1);
  assert.equal(controller.getState().conversations[0].peer_nearby, false);
  // An existing conversation does not re-check proximity or the discovery setting.
  controller.navigate('chat', 'minseo');
  await until(() => !controller.getState().chatLoading && controller.getState().conversationId);
  await controller.send('발견을 꺼도 이어서 보낼 수 있어요');
  assert.equal(controller.getState().outbox.minseo, undefined);
  assert.equal(controller.getState().messages.length, 2);
});

test('a first message to somebody new is refused while discovery is off', async (t) => {
  const { controller } = await setup(t);
  await until(() => !controller.getState().nearbyLoading);
  await controller.setDiscovery(false);
  controller.navigate('chat', 'minseo');
  await until(() => !controller.getState().chatLoading);
  await controller.send('처음 보내는 말');
  assert.equal(controller.getState().outbox.minseo.status, 'failed');
  assert.equal(controller.getState().outbox.minseo.error.code, 'DISCOVERY_OFF');
});

test('a person who left proximity is reported as such and keeps the existing conversation', async (t) => {
  const { controller, api } = await setup(t, (api) => ({ ...api,
    getPerson: async () => { throw new ApiError('OBSERVATION_EXPIRED', '지금은 주변에 없는 사람이에요.'); },
  }));
  await until(() => !controller.getState().nearbyLoading);
  await api.sendMessage({ recipient_id: 'minseo', client_message_id: 'hello', text: '먼저 인사' });
  await controller.refreshAll();
  controller.navigate('detail', 'minseo');
  await until(() => controller.getState().detailError?.code === 'OBSERVATION_EXPIRED');
  assert.equal(controller.getState().detail, null);
  assert.ok(controller.getState().conversations.some((conversation) => conversation.peer.id === 'minseo'));
  // The conversation still opens and its history still loads.
  controller.navigate('chat', 'minseo');
  await until(() => controller.getState().messages.length === 1);
  assert.equal(controller.getState().chatError, null);
});

test('bootstrap auth errors produce a retry screen, not a null-profile crash', async (t) => {
  const { controller } = await setup(t, (api) => ({ ...api, registerInstall: async () => { throw new ApiError('INSTALL_REQUIRED', 'install'); } }));
  assert.equal(controller.getState().booting, false);
  assert.equal(controller.getState().bootError.code, 'INSTALL_REQUIRED');
  assert.equal(controller.getState().me, null);
});

test('double saves are locked and manually retrying recommendation respects cooldown', async (t) => {
  const slow = deferred();
  let calls = 0, refreshCalls = 0;
  const { controller, me } = await setup(t, (api) => ({ ...api,
    updateProfile: () => { calls++; return slow.promise; },
    refreshRecommendations: async () => { refreshCalls++; throw new ApiError('RATE_LIMITED', 'retry', { retryAfter: 10 }); },
  }));
  await until(() => !controller.getState().nearbyLoading);
  const saving = controller.mutate('updateProfile', {});
  await controller.mutate('updateProfile', {});
  assert.equal(calls, 1);
  slow.resolve(me); await saving;
  await controller.retryRecommendations(); await controller.retryRecommendations();
  assert.equal(refreshCalls, 1);
  assert.ok(controller.getState().retryAt > Date.now());
});

test('a stale /me response cannot undo a completed discovery change', async (t) => {
  const slow = deferred();
  let hold = false, requested = false;
  const { controller, me } = await setup(t, (api) => ({ ...api,
    getMe: (...args) => hold ? (requested = true, slow.promise) : api.getMe(...args),
  }));
  await until(() => !controller.getState().nearbyLoading);
  hold = true;
  void controller.refreshAll();
  await until(() => requested);
  await controller.setDiscovery(false);
  hold = false;
  slow.resolve(me);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.getState().me.discovery_enabled, false);
});

test('send response does not skip an unseen peer message before its sequence', async (t) => {
  let deliver = true;
  const { controller, api, me, storage } = await setup(t, (api) => ({ ...api,
    subscribe: (callback, onError) => api.subscribe((event) => { if (deliver) callback(event); }, onError),
  }));
  await until(() => !controller.getState().nearbyLoading);
  await api.sendMessage({ recipient_id: 'minseo', client_message_id: 'initial', text: 'first' });
  controller.navigate('chat', 'minseo');
  await until(() => controller.getState().historyCursor === 1);
  deliver = false;
  const data = JSON.parse(storage.getItem(STATE_KEY));
  const conversation = Object.values(data.conversations)[0];
  conversation.messages.push({ id: 'incoming-2', seq: 2, conversation_id: conversation.id, sender_id: 'minseo', client_message_id: 'peer-request', text: '상대가 보낸 메시지', created_at: new Date().toISOString() });
  storage.setItem(STATE_KEY, JSON.stringify(data));
  await controller.send('my third');
  await until(() => controller.getState().historyCursor === 3);
  assert.deepEqual(controller.getState().messages.map((m) => m.seq), [1, 2, 3]);
  assert.equal(controller.getState().messages[1].sender_id, 'minseo');
  assert.equal(controller.getState().messages[2].sender_id, me.user_id);
});

test('the discovery setting is pushed to native and the real radio state is read back', async (t) => {
  const native = fakeNative({ running: false });
  const { controller } = await setup(t, (api) => api, { native });
  await until(() => !controller.getState().nearbyLoading);
  assert.ok(native.calls.includes('start'));
  assert.equal(controller.getState().native.running, true);
  await controller.setDiscovery(false);
  assert.equal(native.calls.at(-1), 'stop');
  assert.equal(controller.getState().native.running, false);
});

test('a blocked radio does not turn the participation setting off by itself', async (t) => {
  const native = fakeNative();
  const { controller } = await setup(t, (api) => api, { native });
  await until(() => !controller.getState().nearbyLoading);
  native.push({ bluetooth: 'off', running: false });
  await until(() => controller.getState().native.bluetooth === 'off');
  assert.equal(controller.getState().me.discovery_enabled, true);
  assert.equal(controller.getState().native.running, false);
});
