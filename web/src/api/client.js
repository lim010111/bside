import { ApiError } from '../lib/contracts.js';

export const BASE_PATH = '/api/v1';

const MESSAGES = {
  VALIDATION_ERROR: '입력 내용을 확인해 주세요.',
  IDEMPOTENCY_CONFLICT: '같은 전송 요청의 내용이 달라졌어요.',
  IDEMPOTENCY_REPLAY_EXPIRED: '등록 요청이 만료됐어요. 앱을 다시 시작해 주세요.',
  OBSERVATION_REQUIRED: '지금은 주변에 없는 사람이에요.',
  DISCOVERY_DISABLED: '주변 발견이 꺼져 있어요.',
  PROFILE_REQUIRED: '먼저 내 소개를 입력해 주세요.',
  RECIPIENT_NOT_FOUND: '상대를 찾을 수 없어요.',
  CONVERSATION_NOT_FOUND: '대화를 찾을 수 없어요.',
};

// Every call but installation registration carries the installation credential as a
// bearer token. The credential is a secret: it comes from the credential store (the
// native app's protected storage on Android) and is never a public user_id or BLE token.
export function createClient({ base = '', credentials, fetcher = globalThis.fetch, timeout = 15000 } = {}) {
  async function request(path, { method = 'GET', body, signal, anonymous = false } = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    const timer = setTimeout(abort, timeout);
    try {
      const token = anonymous ? null : await credentials?.get();
      if (!anonymous && !token) throw new ApiError('INSTALL_REQUIRED', '설치 정보를 다시 확인해 주세요.');
      const response = await fetcher(base.replace(/\/$/, '') + BASE_PATH + path, {
        method, signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const error = data?.error ?? {};
        const field = error.details?.field;
        throw new ApiError(error.code || 'REQUEST_FAILED',
          MESSAGES[error.code] || error.message || '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.', {
            status: response.status,
            fields: field ? { [field]: MESSAGES[error.code] || error.message } : {},
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
  return {
    registerInstallation: (payload, options) => request('/installations', { ...options, method: 'POST', body: payload, anonymous: true }),
    getMe: (options) => request('/me', options),
    // Full replace. The contract has no partial edit and no expected-revision field.
    putProfile: (payload, options) => request('/me/profile', { ...options, method: 'POST', body: payload }),
    setDiscovery: (payload, options) => request('/me/discovery', { ...options, method: 'POST', body: payload }),
    // Native BLE layer only. Screens never rotate the advertised identifier.
    issueIdentifier: (options) => request('/discovery/identifiers', { ...options, method: 'POST' }),
    reportObservations: (payload, options) => request('/discovery/observations', { ...options, method: 'POST', body: payload }),
    refreshRecommendations: (payload, options) => request('/discovery/recommendations/refresh', { ...options, method: 'POST', body: payload }),
    getConversations: (options) => request('/conversations', options),
    sendMessage: (payload, options) => request('/messages', { ...options, method: 'POST', body: payload }),
    getMessages: (id, query = {}, options) => request('/conversations/' + encodeURIComponent(id) + '/messages?' + new URLSearchParams({ after_seq: 0, limit: 50, ...query }), options),
  };
}
