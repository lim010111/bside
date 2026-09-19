import { ApiError } from '../lib/contracts.js';

const EVENTS = ['ready', 'nearby.changed', 'recommendation.changed', 'conversation.changed', 'self.changed'];

// Authentication uses the install credential the server issued and stores in its own
// HttpOnly cookie. A public user ID or a BLE token is never used as authentication.
//
// Paths below are this frontend's proposal pending T00 (docs/api-contract.md fixes
// endpoints with the server's shared examples). Only the base path changes if they move.
export function createClient({ base = '', fetcher = globalThis.fetch, EventStream = globalThis.EventSource, timeout = 15000 } = {}) {
  async function request(path, { method = 'GET', body, signal } = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    const timer = setTimeout(abort, timeout);
    try {
      const response = await fetcher(base.replace(/\/$/, '') + path, {
        method, credentials: 'include', signal: controller.signal,
        headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new ApiError(data?.error?.code || 'REQUEST_FAILED', data?.error?.message || '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.', {
          status: response.status, fields: data?.error?.fields,
          retryAfter: Number(response.headers.get('Retry-After')) || 0,
        });
      }
      if (!data || typeof data !== 'object') throw new ApiError('INVALID_RESPONSE', '서버 응답을 확인하지 못했어요. 다시 시도해 주세요.');
      return data;
    } catch (error) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (error instanceof ApiError) throw error;
      throw new ApiError('CONNECTION_FAILED', '연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
  const call = (suffix, options) => request('/api' + suffix, options);
  const self = (result) => result.user ?? result;
  return {
    registerInstall: (options) => call('/installs', { ...options, method: 'POST' }),
    getMe: async (options) => {
      try { return self(await call('/me', options)); }
      catch (error) { if (error.code === 'PROFILE_REQUIRED') return null; throw error; }
    },
    createProfile: async (payload, options) => self(await call('/me', { ...options, method: 'POST', body: payload })),
    updateProfile: async (payload, options) => self(await call('/me', { ...options, method: 'PATCH', body: payload })),
    setDiscovery: async (payload, options) => self(await call('/me/discovery', { ...options, method: 'PUT', body: payload })),
    reportObservations: (payload, options) => call('/observations', { ...options, method: 'POST', body: payload }),
    getNearby: (options) => call('/nearby', options),
    getPerson: (id, options) => call('/nearby/' + encodeURIComponent(id), options),
    getRecommendations: (options) => call('/recommendations', options),
    refreshRecommendations: (options) => call('/recommendations/refresh', { ...options, method: 'POST' }),
    getConversations: (options) => call('/conversations', options),
    sendMessage: (payload, options) => call('/messages', { ...options, method: 'POST', body: payload }),
    getMessages: (id, query = {}, options) => call('/conversations/' + encodeURIComponent(id) + '/messages?' + new URLSearchParams({ limit: 50, ...query }), options),
    subscribe(onEvent, onError) {
      const stream = new EventStream(base.replace(/\/$/, '') + '/api/events', { withCredentials: true });
      for (const type of EVENTS) stream.addEventListener(type, (event) => {
        try { onEvent({ type, data: JSON.parse(event.data) }); } catch { onError(); }
      });
      stream.onerror = onError;
      return () => stream.close();
    },
  };
}
