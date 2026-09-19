import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../src/api/client.js';

test('HTTP adapter uses cookies, encoded paths, wire payload and revision', async () => {
  const calls = [];
  const api = createClient({ fetcher: async (url, options) => {
    calls.push({ url, options });
    return Response.json({ user: { user_id: 'me' } });
  } });
  await api.registerInstall();
  const me = await api.updateProfile({ self_description: 'a', connection_intent: 'b', expected_profile_revision: 4 });
  assert.equal(me.user_id, 'me');
  assert.equal(calls[0].url, '/api/installs');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[1].url, '/api/me');
  assert.equal(calls[1].options.method, 'PATCH');
  assert.equal(calls[1].options.credentials, 'include');
  assert.deepEqual(JSON.parse(calls[1].options.body), { self_description: 'a', connection_intent: 'b', expected_profile_revision: 4 });
});
test('a public user ID is encoded into the path, never used as authentication', async () => {
  const calls = [];
  const api = createClient({ fetcher: async (url, options) => { calls.push({ url, options }); return Response.json({ person: {}, recommendation: {} }); } });
  await api.getPerson('slash / id');
  assert.equal(calls[0].url, '/api/nearby/slash%20%2F%20id');
  assert.equal(calls[0].options.credentials, 'include');
  assert.equal(calls[0].options.headers.Authorization, undefined);
});
test('server field errors and retry-after survive, a missing profile alone is null', async () => {
  const api = createClient({ fetcher: async () => Response.json({ error: { code: 'INVALID_INPUT', message: 'invalid', fields: { nickname: 'too long' } } }, { status: 422, headers: { 'Retry-After': '5' } }) });
  await assert.rejects(api.createProfile({}), (error) => error.fields.nickname === 'too long' && error.retryAfter === 5);
  const noProfile = createClient({ fetcher: async () => Response.json({ error: { code: 'PROFILE_REQUIRED' } }, { status: 403 }) });
  assert.equal(await noProfile.getMe(), null);
  const unavailable = createClient({ fetcher: async () => { throw new Error('offline'); } });
  await assert.rejects(unavailable.getMe(), { code: 'CONNECTION_FAILED' });
});
test('HTML responses, timeouts and explicit cancellation are handled', async () => {
  const html = createClient({ fetcher: async () => new Response('<html>wrong proxy</html>') });
  await assert.rejects(html.getNearby(), { code: 'INVALID_RESPONSE' });
  const api = createClient({ timeout: 10, fetcher: (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    if (signal.aborted) reject(new DOMException('aborted', 'AbortError'));
  }) });
  await assert.rejects(api.getNearby(), { code: 'CONNECTION_FAILED' });
  const controller = new AbortController();
  const operation = api.getNearby({ signal: controller.signal });
  controller.abort();
  await assert.rejects(operation, { name: 'AbortError' });
});
test('SSE receives named events with credentials and closes explicitly', () => {
  let stream, received;
  class Stream {
    constructor(url, options) { Object.assign(this, { url, options, handlers: {} }); stream = this; }
    addEventListener(type, handler) { this.handlers[type] = handler; }
    close() { this.closed = true; }
  }
  const api = createClient({ EventStream: Stream });
  const close = api.subscribe((event) => { received = event; }, () => {});
  assert.equal(stream.url, '/api/events');
  assert.equal(stream.options.withCredentials, true);
  stream.handlers.ready({ data: '{"nearby_version":3}' });
  assert.equal(received.type, 'ready');
  assert.equal(stream.handlers['room.closed'], undefined);
  close(); assert.equal(stream.closed, true);
});
