import { ApiError } from '../lib/contracts.js';

const EVENTS = ['ready', 'participants.changed', 'recommendation.changed', 'conversation.changed', 'self.changed', 'room.closed'];

// Authentication uses the server's HttpOnly cookie, never a public participant ID.
export function createClient({ base = '', fetcher = globalThis.fetch, EventStream = globalThis.EventSource, timeout = 15000 } = {}) {
  const roomPath = (code) => '/api/rooms/' + encodeURIComponent(code);
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
  const call = (code, suffix, options) => request(roomPath(code) + suffix, options);
  const self = (result) => result.participant ?? result;
  return {
    ensureSession: (options) => request('/api/session', { ...options, method: 'POST' }),
    getRoom: async (code, options) => (await call(code, '', options)).room,
    getMe: async (code, options) => {
      try { return self(await call(code, '/me', options)); }
      catch (error) { if (error.code === 'PARTICIPATION_REQUIRED') return null; throw error; }
    },
    join: async (code, payload, options) => self(await call(code, '/participants', { ...options, method: 'POST', body: payload })),
    updateMe: async (code, payload, options) => self(await call(code, '/me', { ...options, method: 'PATCH', body: payload })),
    stop: async (code, options) => self(await call(code, '/me/stop', { ...options, method: 'POST' })),
    resume: async (code, options) => self(await call(code, '/me/resume', { ...options, method: 'POST' })),
    getParticipants: (code, options) => call(code, '/participants', options),
    getParticipant: (code, id, options) => call(code, '/participants/' + encodeURIComponent(id), options),
    getRecommendations: (code, options) => call(code, '/recommendations', options),
    refreshRecommendations: (code, options) => call(code, '/recommendations/refresh', { ...options, method: 'POST' }),
    getConversations: (code, options) => call(code, '/conversations', options),
    sendMessage: (code, payload, options) => call(code, '/messages', { ...options, method: 'POST', body: payload }),
    getMessages: (code, id, query = {}, options) => call(code, '/conversations/' + encodeURIComponent(id) + '/messages?' + new URLSearchParams({ limit: 50, ...query }), options),
    subscribe(code, onEvent, onError) {
      const stream = new EventStream(base.replace(/\/$/, '') + roomPath(code) + '/events', { withCredentials: true });
      for (const type of EVENTS) stream.addEventListener(type, (event) => {
        try { onEvent({ type, data: JSON.parse(event.data) }); } catch { onError(); }
      });
      stream.onerror = onError;
      return () => stream.close();
    },
  };
}
