import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoomController } from '../src/room-controller.js';
import { ApiError } from '../src/lib/contracts.js';
import { fixture, deferred, until, profile } from './helpers.js';

async function setup(t, change = (api) => api) {
  const data = await fixture();
  const api = change(data.api);
  const controller = createRoomController({ api, code: 'KOSS26' });
  t.after(() => controller.dispose());
  await controller.start();
  return { ...data, api, controller };
}

test('waits for SSE ready before protected lists, then loads candidates despite recommendation failure', async (t) => {
  let event, listCalls = 0;
  const { controller } = await setup(t, (api) => ({ ...api,
    subscribe: (_code, callback) => { event = callback; return () => {}; },
    getParticipants: (...args) => { listCalls++; return api.getParticipants(...args); },
    getRecommendations: async () => { throw new ApiError('FAILED', '추천 실패'); },
  }));
  assert.equal(listCalls, 0);
  event({ type: 'ready', data: { room_status: 'open' } });
  await until(() => controller.getState().recommendationState === 'failed');
  assert.ok(controller.getState().participants.length > 0);
  assert.equal(controller.getState().peopleLoading, false);
});

test('profile change invalidates stale reasons, keeps ID, and stop/resume preserves state', async (t) => {
  const { controller, me } = await setup(t);
  await until(() => !controller.getState().peopleLoading);
  const updated = await controller.mutate('updateMe', { ...profile(), self_description: '디자인 공부 중', expected_profile_version: 1 });
  assert.equal(updated.ok, true);
  assert.equal(controller.getState().me.id, me.id);
  assert.equal(controller.getState().me.profile_version, 2);
  await controller.mutate('stop');
  assert.equal(controller.getState().me.participation_status, 'stopped');
  await controller.mutate('resume');
  assert.equal(controller.getState().me.participation_status, 'active');
});

test('an old participant response cannot overwrite the newly selected participant', async (t) => {
  const slow = deferred();
  let started = false;
  const { controller } = await setup(t, (api) => ({ ...api,
    getParticipant: (code, id, options) => id === 'minseo' ? (started = true, slow.promise) : api.getParticipant(code, id, options),
  }));
  await until(() => !controller.getState().peopleLoading);
  controller.navigate('detail', 'minseo');
  await until(() => started);
  controller.navigate('detail', 'yerin');
  await until(() => controller.getState().detail?.participant.id === 'yerin');
  slow.resolve({ participant: { id: 'minseo', nickname: '민서', profile_version: 1, participation_status: 'active' }, recommendation: null });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.getState().detail.participant.id, 'yerin');
  assert.equal(controller.getState().targetId, 'yerin');
});

test('a lost send response retries with the same ID and stores exactly one message', async (t) => {
  const calls = [];
  let failOnce = true;
  const { controller, api } = await setup(t, (api) => ({ ...api,
    sendMessage: async (...args) => {
      calls.push(args[1]);
      const saved = await api.sendMessage(...args);
      if (failOnce) { failOnce = false; throw new ApiError('CONNECTION_FAILED', '응답 유실'); }
      return saved;
    },
  }));
  await until(() => !controller.getState().peopleLoading);
  controller.navigate('chat', 'minseo');
  await until(() => !controller.getState().chatLoading && controller.getState().peer);
  controller.setDraft('minseo', '안녕하세요');
  await controller.send('안녕하세요');
  assert.equal(controller.getState().outbox.minseo.status, 'failed');
  assert.equal(controller.getState().drafts.minseo, '안녕하세요');
  await controller.send('안녕하세요', true);
  assert.equal(calls[0].client_message_id, calls[1].client_message_id);
  const conversation = (await api.getConversations('KOSS26')).items[0];
  assert.equal((await api.getMessages('KOSS26', conversation.id)).items.length, 1);
  assert.equal(controller.getState().drafts.minseo, '');
});

test('late sends do not appear in another conversation', async (t) => {
  const slow = deferred();
  let save;
  const { controller } = await setup(t, (api) => ({ ...api,
    sendMessage: (...args) => { save = () => api.sendMessage(...args); return slow.promise; },
  }));
  await until(() => !controller.getState().peopleLoading);
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
    subscribe: (code, callback, onError) => api.subscribe(code, (event) => { if (deliver) callback(event); }, onError),
  }));
  await until(() => !controller.getState().peopleLoading);
  await api.sendMessage('KOSS26', { recipient_id: 'minseo', client_message_id: 'initial', text: 'first' });
  controller.navigate('chat', 'minseo');
  await until(() => controller.getState().historyCursor === 1);
  // Store messages without delivering change notifications to this controller.
  deliver = false;
  for (let i = 2; i <= 125; i++) await api.sendMessage('KOSS26', { recipient_id: 'minseo', client_message_id: String(i), text: String(i) });
  deliver = true;
  await controller.refreshAll();
  await until(() => controller.getState().historyCursor === 125);
  assert.equal(controller.getState().messages.length, 125);
  assert.equal(controller.getState().messages[0].seq, 1);
  assert.equal(controller.getState().hasOlder, false);
});

test('closure clears personal state and ignores late responses even if abort is ignored', async (t) => {
  const slow = deferred();
  let waiting = false;
  const { controller, api } = await setup(t, (api) => ({ ...api,
    getParticipant: () => { waiting = true; return slow.promise; },
  }));
  await until(() => !controller.getState().peopleLoading);
  controller.navigate('detail', 'minseo');
  await until(() => waiting);
  await api.closeRoom('KOSS26');
  await until(() => controller.getState().room.status === 'closed');
  slow.resolve({ participant: { id: 'minseo' }, recommendation: null });
  await new Promise((resolve) => setImmediate(resolve));
  const state = controller.getState();
  assert.equal(state.me, null); assert.equal(state.detail, null);
  assert.equal(state.participants.length, 0); assert.deepEqual(state.drafts, {});
  controller.navigate('people');
  assert.equal(controller.getState().room.status, 'closed');
});

test('bootstrap auth errors produce a retry screen, not a null-room entry crash', async (t) => {
  const { controller } = await setup(t, (api) => ({ ...api, ensureSession: async () => { throw new ApiError('SESSION_REQUIRED', 'session'); } }));
  assert.equal(controller.getState().booting, false);
  assert.equal(controller.getState().bootError.code, 'SESSION_REQUIRED');
});

test('double joins are locked and manually retrying recommendation respects cooldown', async (t) => {
  const slow = deferred();
  let calls = 0, refreshCalls = 0;
  const { controller, me } = await setup(t, (api) => ({ ...api,
    updateMe: () => { calls++; return slow.promise; },
    refreshRecommendations: async () => { refreshCalls++; throw new ApiError('RATE_LIMITED', 'retry', { retryAfter: 10 }); },
  }));
  await until(() => !controller.getState().peopleLoading);
  const saving = controller.mutate('updateMe', {});
  await controller.mutate('updateMe', {});
  assert.equal(calls, 1);
  slow.resolve(me); await saving;
  await controller.retryRecommendations(); await controller.retryRecommendations();
  assert.equal(refreshCalls, 1);
  assert.ok(controller.getState().retryAt > Date.now());
});
