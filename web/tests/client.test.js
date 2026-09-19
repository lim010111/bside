import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../src/api/client.js';

test('HTTP adapter uses cookies, encoded paths, wire payload and version', async () => {
  const calls = [];
  const api = createClient({ fetcher: async (url, options) => {
    calls.push({ url, options });
    return Response.json({ participant: { id: 'me' } });
  } });
  await api.ensureSession();
  const me = await api.updateMe('space / room', { self_description: 'a', connection_intent: 'b', expected_profile_version: 4 });
  assert.equal(me.id, 'me');
  assert.equal(calls[0].url, '/api/session');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[1].url, '/api/rooms/space%20%2F%20room/me');
  assert.equal(calls[1].options.method, 'PATCH');
  assert.equal(calls[1].options.credentials, 'include');
  assert.deepEqual(JSON.parse(calls[1].options.body), { self_description: 'a', connection_intent: 'b', expected_profile_version: 4 });
});
test('server field errors and retry-after survive, missing membership alone is null', async () => {
  const api = createClient({ fetcher: async () => Response.json({ error: { code: 'INVALID_INPUT', message: 'invalid', fields: { nickname: 'too long' } } }, { status: 422, headers: { 'Retry-After': '5' } }) });
  await assert.rejects(api.join('room', {}), (error) => error.fields.nickname === 'too long' && error.retryAfter === 5);
  const noMember = createClient({ fetcher: async () => Response.json({ error: { code: 'PARTICIPATION_REQUIRED' } }, { status: 403 }) });
  assert.equal(await noMember.getMe('room'), null);
  const unavailable = createClient({ fetcher: async () => { throw new Error('offline'); } });
  await assert.rejects(unavailable.getMe('room'), { code: 'CONNECTION_FAILED' });
});
test('HTML responses, timeouts and explicit cancellation are handled', async () => {
  const html = createClient({ fetcher: async () => new Response('<html>wrong proxy</html>') });
  await assert.rejects(html.getRoom('room'), { code: 'INVALID_RESPONSE' });
  const api = createClient({ timeout: 10, fetcher: (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    if (signal.aborted) reject(new DOMException('aborted', 'AbortError'));
  }) });
  await assert.rejects(api.getRoom('room'), { code: 'CONNECTION_FAILED' });
  const controller = new AbortController();
  const operation = api.getRoom('room', { signal: controller.signal });
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
  const close = api.subscribe('room', (event) => { received = event; }, () => {});
  assert.equal(stream.options.withCredentials, true);
  stream.handlers.ready({ data: '{"room_status":"open"}' });
  assert.equal(received.type, 'ready');
  close(); assert.equal(stream.closed, true);
});
