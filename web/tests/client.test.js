import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient, BASE_PATH } from '../src/api/client.js';

const store = (value = 'ic_secret') => ({ get: async () => value, set: async () => {}, installRequestId: () => 'id' });

test('every call but registration carries the installation credential as a bearer token', async () => {
  const calls = [];
  const api = createClient({ credentials: store(), fetcher: async (url, options) => {
    calls.push({ url, options });
    return Response.json({ user_id: 'u', profile: null, discovery_enabled: false });
  } });
  await api.registerInstallation({ installation_request_id: 'r', platform: 'android' });
  await api.getMe();
  assert.equal(calls[0].url, BASE_PATH + '/installations');
  assert.equal(calls[0].options.headers.Authorization, undefined, '설치 등록은 인증 없이 호출한다');
  assert.equal(calls[1].url, BASE_PATH + '/me');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer ic_secret');
  // The credential is a header secret, never a cookie and never a public user_id.
  assert.equal(calls[1].options.credentials, undefined);
});
test('a missing credential fails before any request leaves the app', async () => {
  let called = false;
  const api = createClient({ credentials: store(null), fetcher: async () => { called = true; return Response.json({}); } });
  await assert.rejects(api.getMe(), { code: 'INSTALL_REQUIRED' });
  assert.equal(called, false);
});
test('profile is a full replace and discovery is a POST of the new state', async () => {
  const calls = [];
  const api = createClient({ credentials: store(), fetcher: async (url, options) => {
    calls.push({ url, options });
    return Response.json({ discovery_enabled: true });
  } });
  await api.putProfile({ nickname: 'a', self_description: 'b', connection_intent: 'c' });
  await api.setDiscovery({ enabled: true });
  assert.equal(calls[0].url, BASE_PATH + '/me/profile');
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), { nickname: 'a', self_description: 'b', connection_intent: 'c' });
  assert.equal(calls[1].url, BASE_PATH + '/me/discovery');
  assert.deepEqual(JSON.parse(calls[1].options.body), { enabled: true });
});
test('history is forward-only from after_seq, and the path encodes the conversation id', async () => {
  const calls = [];
  const api = createClient({ credentials: store(), fetcher: async (url) => {
    calls.push(url);
    return Response.json({ messages: [], next_after_seq: null, has_more: false });
  } });
  await api.getMessages('slash / id', { after_seq: 7 });
  assert.match(calls[0], /\/conversations\/slash%20%2F%20id\/messages\?/);
  assert.match(calls[0], /after_seq=7/);
  assert.match(calls[0], /limit=50/);
});
test('the contract error shape becomes a field error and keeps Retry-After', async () => {
  const api = createClient({ credentials: store(), fetcher: async () => Response.json(
    { error: { code: 'VALIDATION_ERROR', message: 'nickname must contain 1 to 20 characters', details: { field: 'nickname' } } },
    { status: 422, headers: { 'Retry-After': '5' } }) });
  await assert.rejects(api.putProfile({}), (error) => Boolean(error.fields.nickname) && error.retryAfter === 5 && error.code === 'VALIDATION_ERROR');
});
test('contract error codes are rendered in the user\'s language', async () => {
  const forbidden = createClient({ credentials: store(), fetcher: async () => Response.json(
    { error: { code: 'OBSERVATION_REQUIRED', message: 'observation required', details: {} } }, { status: 403 }) });
  await assert.rejects(forbidden.sendMessage({}), (error) => error.code === 'OBSERVATION_REQUIRED' && error.message === '지금은 주변에 없는 사람이에요.');
});
test('HTML responses, timeouts and explicit cancellation are handled', async () => {
  const html = createClient({ credentials: store(), fetcher: async () => new Response('<html>wrong proxy</html>') });
  await assert.rejects(html.getConversations(), { code: 'INVALID_RESPONSE' });
  const api = createClient({ credentials: store(), timeout: 10, fetcher: (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    if (signal.aborted) reject(new DOMException('aborted', 'AbortError'));
  }) });
  await assert.rejects(api.getConversations(), { code: 'CONNECTION_FAILED' });
  const controller = new AbortController();
  const operation = api.getConversations({ signal: controller.signal });
  controller.abort();
  await assert.rejects(operation, { name: 'AbortError' });
});
test('v0.1 exposes no nearby, per-user or realtime endpoint', () => {
  const api = createClient({ credentials: store(), fetcher: async () => Response.json({}) });
  for (const gone of ['getNearby', 'getPerson', 'subscribe']) assert.equal(api[gone], undefined, gone + '는 계약에 없다');
});
