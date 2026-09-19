import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiscoveryController } from '../src/discovery-controller.js';
import { createClient } from '../src/api/client.js';
import { ApiError } from '../src/lib/contracts.js';
import { fixture, deferred, until, observed, fakeNative, profile } from './helpers.js';

function fakeTimers() {
  let id = 0, time = Date.now();
  const queued = new Map();
  return {
    now: () => time,
    setTimeout(fn, ms) { queued.set(++id, { fn, ms }); return id; },
    clearTimeout(key) { queued.delete(key); },
    size: () => queued.size,
    delay: () => queued.values().next().value?.ms,
    fire() {
      assert.equal(queued.size, 1, 'only one recommendation refresh may be queued');
      const [key, { fn, ms }] = queued.entries().next().value;
      queued.delete(key); time += ms;
      return fn();
    },
  };
}
const pending = (id) => observed(id, id, { recommendation: { status: 'pending', rank: 0 } });
const ready = (person) => ({ ...person, recommendation: { status: 'ready', rank: 0, reason: '서로 이야기할 구체적인 접점이 있어요.' } });

async function setup(t, refreshRecommendations) {
  const data = await fixture();
  const native = fakeNative(), timers = fakeTimers();
  const calls = [];
  const api = { ...data.api, refreshRecommendations: async (...args) => {
    calls.push(args);
    return refreshRecommendations(...args);
  } };
  const controller = createDiscoveryController({ api, native, credentials: data.credentials, timers, now: timers.now });
  t.after(() => controller.dispose());
  await controller.start();
  await until(() => !controller.getState().nearbyLoading);
  await controller.refreshAll();
  return { controller, native, timers, calls };
}

test('pending recommendations arrive in one poll without another scan and update open detail', async (t) => {
  const person = pending('first');
  const { controller, native, timers, calls } = await setup(t, async () => ({ observed_users: [ready(person)] }));
  native.pushObservations({ observed_users: [person] });
  controller.navigate('detail', person.user_id);
  const scans = native.calls.filter((call) => call === 'refreshObservations').length;
  assert.equal(timers.delay(), 1000);
  await timers.fire();
  assert.equal(controller.getState().detail.recommendation.status, 'ready');
  assert.equal(controller.getState().people[0].last_seen_at, person.last_seen_at);
  assert.equal(controller.getState().people[0].conversation_eligibility_expires_at, person.conversation_eligibility_expires_at);
  assert.equal(native.calls.filter((call) => call === 'refreshObservations').length, scans);
  assert.deepEqual(calls[0][0], { user_ids: ['first'] });
  assert.equal(timers.size(), 0, 'completed results stop fast polling');
});

test('partial batches render immediately and only pending work keeps polling', async (t) => {
  const people = Array.from({ length: 20 }, (_, i) => pending(String(i)));
  let step = 0;
  const { controller, native, timers } = await setup(t, async () => {
    const completed = ++step === 1 ? 5 : 20;
    return { observed_users: people.map((person, i) => i < completed ? ready(person) : person) };
  });
  native.pushObservations({ observed_users: people });
  await timers.fire();
  assert.equal(controller.getState().people.length, 20);
  assert.equal(controller.getState().people.filter((p) => p.recommendation.status === 'ready').length, 5);
  assert.equal(timers.delay(), 1000);
  await timers.fire();
  assert.equal(controller.getState().people.filter((p) => p.recommendation.status === 'ready').length, 20);
  assert.equal(timers.size(), 0);
});

test('a superseded response cannot overwrite a new observation, and calls never overlap', async (t) => {
  const held = deferred(), old = pending('old'), recent = pending('recent');
  let call = 0;
  const { controller, native, timers } = await setup(t, async () => ++call === 1 ? held.promise : { observed_users: [ready(recent)] });
  native.pushObservations({ observed_users: [old] });
  const inflight = timers.fire();
  assert.equal(timers.size(), 0, 'no timer while a request is outstanding');
  native.pushObservations({ observed_users: [recent] });
  held.resolve({ observed_users: [ready(old)] });
  await inflight;
  assert.equal(controller.getState().people[0].user_id, 'recent');
  await timers.fire();
  assert.equal(controller.getState().people[0].recommendation.status, 'ready');
});

test('network errors back off and stop within the refresh window', async (t) => {
  const { native, timers, calls } = await setup(t, async () => { throw new ApiError('CONNECTION_FAILED', 'offline'); });
  native.pushObservations({ observed_users: [pending('person')] });
  const delays = [];
  while (timers.size()) { delays.push(timers.delay()); await timers.fire(); }
  assert.deepEqual(delays.slice(0, 4), [1000, 2000, 4000, 8000]);
  assert.ok(calls.length <= 12);
});

test('hidden or chat screens make no fast requests', async (t) => {
  const original = globalThis.document;
  t.after(() => { if (original === undefined) delete globalThis.document; else globalThis.document = original; });
  const { controller, native, timers, calls } = await setup(t, async () => ({ observed_users: [] }));
  native.pushObservations({ observed_users: [pending('person')] });
  globalThis.document = { visibilityState: 'hidden' };
  await timers.fire();
  assert.equal(calls.length, 0);
  globalThis.document.visibilityState = 'visible';
  controller.navigate('conversations');
  await timers.fire();
  assert.equal(calls.length, 0);
  controller.navigate('nearby');
  await timers.fire();
  assert.equal(calls.length, 1);
  assert.equal(timers.size(), 0);
});

test('turning discovery off or disposing suppresses an in-flight recommendation', async (t) => {
  for (const action of ['off', 'dispose']) {
    const held = deferred(), person = pending('person');
    const { controller, native, timers } = await setup(t, async () => held.promise);
    native.pushObservations({ observed_users: [person] });
    const inflight = timers.fire();
    if (action === 'off') await controller.setDiscovery(false);
    else controller.dispose();
    held.resolve({ observed_users: [ready(person)] });
    await inflight;
    assert.equal(timers.size(), 0);
    assert.ok(controller.getState().people.every((p) => p.recommendation.status !== 'ready'));
  }
});

test('profile editing retires a reason and refreshes without another observation', async (t) => {
  const person = pending('person');
  const { controller, native, timers } = await setup(t, async () => ({ observed_users: [ready(person)] }));
  // No fresh scans will arrive during or after the save.
  native.refreshObservations = async () => null;
  native.pushObservations({ observed_users: [ready(person)] });
  assert.equal(timers.size(), 0);
  await controller.saveProfile(profile('changed'));
  assert.equal(controller.getState().people[0].recommendation.status, 'pending');
  await timers.fire();
  assert.equal(controller.getState().people[0].recommendation.status, 'ready');
});

test('recommendation refresh sends authenticated user IDs, never BLE observations', async () => {
  let sent;
  const api = createClient({ credentials: { get: async () => 'secret' }, fetcher: async (url, options) => {
    sent = { url, options }; return Response.json({ observed_users: [] });
  } });
  await api.refreshRecommendations({ user_ids: ['person'] });
  assert.equal(sent.url, '/api/v1/discovery/recommendations/refresh');
  assert.equal(sent.options.headers.Authorization, 'Bearer secret');
  assert.equal(sent.options.method, 'POST');
  assert.deepEqual(JSON.parse(sent.options.body), { user_ids: ['person'] });
});

test('failed evaluations use a cooldown instead of fast retrying or staying stuck', async (t) => {
  const person = pending('person');
  let step = 0;
  const { controller, native, timers } = await setup(t, async () => {
    step++;
    return { observed_users: [step === 1 ? { ...person, recommendation: { status: 'failed' } }
      : step === 2 ? person : ready(person)] };
  });
  native.pushObservations({ observed_users: [person] });
  await timers.fire();
  assert.equal(controller.getState().people[0].recommendation.status, 'failed');
  assert.equal(timers.delay(), 15000);
  await timers.fire();
  assert.equal(timers.delay(), 1000);
  await timers.fire();
  assert.equal(controller.getState().people[0].recommendation.status, 'ready');
  assert.equal(timers.size(), 0);
});
