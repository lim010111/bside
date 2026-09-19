import { ApiError, mergeMessages } from './lib/contracts.js';
import { UNSUPPORTED } from './lib/native.js';

export const initialState = () => ({
  me: null, booting: true, bootError: null, notice: null,
  view: 'nearby', targetId: null, busy: null,
  people: [], observedAt: null, nearbyLoading: true, nearbyError: null,
  conversations: [], conversationsLoading: true, conversationsError: null,
  peer: null, conversationId: null, messages: [], chatLoading: false, chatError: null,
  historyCursor: null, outbox: {}, drafts: {},
  connection: 'connecting', native: UNSUPPORTED,
});

export function discoveryReducer(state, action) {
  if (action.type === 'patch') return { ...state, ...action.value };
  if (action.type === 'messages') {
    if (state.targetId !== action.peerId || state.view !== 'chat') return state;
    return { ...state, messages: mergeMessages(state.messages, action.items) };
  }
  return state;
}

// Framework-independent controller: async ownership, retries and proximity expiry are
// tested here.
//
// API v0.1 has no nearby endpoint, so the list is PUSHED from the native scanner's
// observation report. It also has no per-user endpoint, so the detail screen reads
// the last observation response from memory — a cache for redrawing, never proof of
// proximity. The server re-checks eligibility when the first message is saved.
export function createDiscoveryController({ api, native, credentials, route = () => ({ view: 'nearby' }), writeRoute = () => {}, now = Date.now }) {
  let state = initialState();
  const listeners = new Set(), requests = new Map();
  let epoch = 0, alive = false, unsubscribeStatus, unsubscribeObservations, refreshTimer;
  let refreshRunning = false, refreshAgain = false;
  let historyRunning = false, historyAgain = false;
  const emit = (action) => {
    state = discoveryReducer(state, action);
    for (const listener of listeners) listener(state);
  };
  const patch = (value) => emit({ type: 'patch', value });
  const open = () => alive;
  function cancelRequests() {
    for (const request of requests.values()) request.controller.abort();
    requests.clear();
  }
  function cancelScope(scope) {
    requests.get(scope)?.controller.abort();
    requests.delete(scope);
  }
  function disconnect() {
    clearInterval(refreshTimer);
  }
  function errorBoundary(error) {
    if (['UNAUTHORIZED', 'INSTALL_REQUIRED'].includes(error.code)) {
      epoch++; cancelRequests(); disconnect();
      patch({ ...initialState(), booting: false, native: state.native,
        notice: '설치 정보를 다시 확인해 주세요.', connection: 'offline' });
    }
  }
  // Each scope has one current request; superseded results cannot win a race.
  async function request(scope, operation, success, failure) {
    const ownEpoch = epoch;
    requests.get(scope)?.controller.abort();
    const token = { controller: new AbortController() };
    requests.set(scope, token);
    const current = () => open() && ownEpoch === epoch && requests.get(scope) === token;
    try {
      const result = await operation({ signal: token.controller.signal });
      if (current()) success?.(result);
      return current() ? result : undefined;
    } catch (error) {
      if (current() && error.name !== 'AbortError') {
        if (scope !== 'boot') errorBoundary(error);
        if (open() && ownEpoch === epoch) failure?.(error);
      }
      return undefined;
    } finally {
      if (requests.get(scope) === token) requests.delete(scope);
    }
  }
  function applyMe(me) {
    patch({ me, connection: 'connected' });
    void syncNative(me);
  }
  // The setting is the user's intent; the radio is what is actually running. We push
  // the intent down and read the real state back rather than assuming it took effect.
  async function syncNative(me) {
    if (!native?.supported) return;
    const status = await (me.discovery_enabled && me.profile ? native.start() : native.stop());
    if (!open()) return;
    patch({ native: status });
    if (!me.discovery_enabled) patch({ people: [], observedAt: null, nearbyLoading: false });
  }
  // The only source of a nearby list in v0.1.
  function applyObservations(result) {
    if (!result?.observed_users) return;
    patch({ people: result.observed_users, observedAt: now(), nearbyLoading: false, nearbyError: null });
  }
  async function scanNearby() {
    if (!state.me?.discovery_enabled || !state.me.profile) {
      patch({ nearbyLoading: false });
      return;
    }
    if (!native?.supported) {
      // No radio here: say so instead of showing an empty list as if nobody is around.
      patch({ nearbyLoading: false });
      return;
    }
    const result = await native.refreshObservations();
    if (open() && result) applyObservations(result);
    else if (open()) patch({ nearbyLoading: false });
  }
  function selectDetail() {
    const id = state.targetId;
    if (state.view !== 'detail' || !id) return;
    const person = state.people.find((candidate) => candidate.user_id === id) ?? null;
    patch({ detailLoading: false, detail: person });
  }
  async function loadConversations() {
    await request('conversations', (options) => api.getConversations(options), (result) => {
      const active = result.conversations.find((c) => c.participant.user_id === state.targetId);
      patch({ conversations: result.conversations, conversationsLoading: false, conversationsError: null,
        ...(state.view === 'chat' && active ? { conversationId: active.conversation_id, peer: active.participant } : {}) });
    }, (error) => patch({ conversationsLoading: false, conversationsError: error }));
  }
  async function loadChat() {
    const id = state.targetId;
    if (state.view !== 'chat' || !id) return;
    await loadConversations();
    if (state.view !== 'chat' || state.targetId !== id) return;
    if (!state.conversationId) {
      // No conversation yet: the name comes from the observation cache.
      const observed = state.people.find((candidate) => candidate.user_id === id);
      if (observed) patch({ peer: { user_id: observed.user_id, profile: observed.profile }, chatLoading: false });
      else patch({ chatError: new ApiError('OBSERVATION_REQUIRED', '지금은 주변에 없는 사람이에요.'), chatLoading: false });
      return;
    }
    await syncHistory();
  }
  // History is forward-only: v0.1 has no before_seq, so there is no older-messages
  // control. The watermark advances only on history pages, never on a send response,
  // so a peer message racing with our own send is never skipped.
  async function syncHistory() {
    if (historyRunning) { historyAgain = true; return; }
    const ownEpoch = epoch;
    historyRunning = true;
    try {
      do {
        historyAgain = false;
        const id = state.targetId, conversation = state.conversationId;
        if (!open() || ownEpoch !== epoch || state.view !== 'chat') break;
        if (!conversation) { patch({ chatLoading: false }); break; }
        const cursor = state.historyCursor ?? 0;
        await request('history', async (options) => {
          const query = { after_seq: cursor };
          let page = await api.getMessages(conversation, query, options);
          let items = page.messages, last = page.next_after_seq ?? items.at(-1)?.seq ?? cursor;
          while (page.has_more) {
            if (!page.messages.length || page.next_after_seq <= query.after_seq) throw new ApiError('INVALID_RESPONSE', '대화 이력을 다시 불러와 주세요.');
            query.after_seq = page.next_after_seq;
            page = await api.getMessages(conversation, query, options);
            items = mergeMessages(items, page.messages);
            last = page.next_after_seq ?? items.at(-1)?.seq ?? last;
          }
          return { items, last };
        }, ({ items, last }) => {
          if (state.view !== 'chat' || state.targetId !== id || state.conversationId !== conversation) return;
          emit({ type: 'messages', peerId: id, items });
          patch({ historyCursor: last, chatLoading: false, chatError: null });
        }, (error) => { if (state.targetId === id) patch({ chatLoading: false, chatError: error }); });
      } while (historyAgain && ownEpoch === epoch);
    } finally {
      historyRunning = false;
      if (historyAgain && open()) { historyAgain = false; void syncHistory(); }
    }
  }
  async function refreshAll() {
    if (!open() || !state.me) return;
    if (refreshRunning) { refreshAgain = true; return; }
    const ownEpoch = epoch;
    refreshRunning = true;
    try {
      do {
        refreshAgain = false;
        await request('me', (options) => api.getMe(options), applyMe, (error) => patch({ notice: error.message, connection: 'offline' }));
        if (!state.me?.profile || !open() || ownEpoch !== epoch) break;
        await scanNearby();
        if (!open() || ownEpoch !== epoch) break;
        await loadConversations();
        if (state.view === 'detail') selectDetail();
        if (state.view === 'chat') await loadChat();
      } while (refreshAgain && open() && ownEpoch === epoch);
    } finally {
      refreshRunning = false;
      if (refreshAgain && open() && state.me) { refreshAgain = false; void refreshAll(); }
    }
  }
  // v0.1 has no SSE or WebSocket, so the visible screen polls. Scanning and
  // observation reporting stay in the native layer, never on this timer.
  function connect() {
    disconnect();
    refreshTimer = setInterval(() => {
      if (open() && globalThis.document?.visibilityState !== 'hidden') void refreshAll();
    }, 15000);
  }
  async function start() {
    alive = true; epoch++; cancelRequests(); disconnect();
    patch({ booting: true, bootError: null });
    if (native?.supported) {
      unsubscribeStatus?.(); unsubscribeObservations?.();
      unsubscribeStatus = native.subscribeStatus((status) => { if (open()) patch({ native: status }); });
      unsubscribeObservations = native.subscribeObservations((result) => { if (open()) applyObservations(result); });
      const status = await native.getStatus();
      if (open()) patch({ native: status });
    }
    await request('boot', async (options) => {
      if (!(await credentials.get())) {
        const installation = await api.registerInstallation({
          installation_request_id: credentials.installRequestId(), platform: 'android',
        }, options);
        await credentials.set(installation.installation_credential);
      }
      return api.getMe(options);
    }, (me) => {
      patch({ me, booting: false, connection: 'connected' });
      if (me.profile) { navigate(route().view, route().id, false); connect(); void syncNative(me); void refreshAll(); }
      else patch({ nearbyLoading: false });
    }, (error) => patch({ booting: false, bootError: error }));
  }
  function dispose() {
    alive = false; epoch++; cancelRequests(); disconnect();
    unsubscribeStatus?.(); unsubscribeStatus = null;
    unsubscribeObservations?.(); unsubscribeObservations = null;
  }
  function navigate(view = 'nearby', id = null, write = true) {
    if (!open()) return;
    const allowed = ['nearby', 'profile', 'detail', 'chat', 'conversations'];
    if (!allowed.includes(view) || (['detail', 'chat'].includes(view) && !id)) { view = 'nearby'; id = null; }
    const changing = state.view !== view || state.targetId !== id;
    patch({ view, targetId: id, notice: null, ...(changing ? {
      detail: null, detailLoading: view === 'detail', detailError: null,
      peer: null, conversationId: null, messages: [], historyCursor: null,
      chatLoading: view === 'chat', chatError: null,
    } : {}) });
    if (write) writeRoute({ view, id });
    if (!state.me?.profile) return;
    if (view === 'detail') selectDetail();
    if (view === 'chat') void loadChat();
    if (view === 'conversations') void loadConversations();
  }
  // Profile is a full replace: v0.1 has no partial edit and no expected-revision, so
  // there is no client-side conflict to resolve. Identical values are a no-op.
  async function saveProfile(payload) {
    if (state.busy || !open()) return { ok: false };
    patch({ busy: 'saveProfile', notice: null });
    let outcome = { ok: false };
    await request('mutation', (options) => api.putProfile(payload, options), (profile) => {
      cancelScope('me');
      const first = !state.me?.profile;
      patch({ me: { ...state.me, profile }, busy: null });
      outcome = { ok: true };
      navigate('nearby');
      if (first) { connect(); void syncNative({ ...state.me, profile }); }
      void refreshAll();
    }, (error) => { patch({ busy: null }); outcome = { ok: false, error }; });
    return outcome;
  }
  async function setDiscovery(enabled) {
    if (state.busy || !open()) return { ok: false };
    patch({ busy: 'setDiscovery', notice: null });
    let outcome = { ok: false };
    await request('mutation', (options) => api.setDiscovery({ enabled }, options), (result) => {
      // A pre-mutation /me response can still be in flight with the old flag.
      cancelScope('me');
      const me = { ...state.me, discovery_enabled: result.discovery_enabled };
      patch({ me, busy: null });
      outcome = { ok: true };
      void syncNative(me).then(() => { if (open()) void refreshAll(); });
    }, (error) => { patch({ busy: null }); outcome = { ok: false, error }; });
    return outcome;
  }
  function setDraft(id, value) { patch({ drafts: { ...state.drafts, [id]: value } }); }
  async function send(text, retry = false) {
    const peerId = state.targetId;
    if (!peerId || !open() || state.view !== 'chat') return;
    const previous = state.outbox[peerId];
    if (previous?.status === 'sending' || (previous?.retryAt ?? 0) > now()) return;
    const entry = retry && previous ? { ...previous, status: 'sending', error: null }
      : { client_message_id: globalThis.crypto.randomUUID(), recipient_id: peerId, text: text.trim(), status: 'sending', error: null };
    if (!entry.text) return;
    patch({ outbox: { ...state.outbox, [peerId]: entry } });
    await request('send:' + peerId, (options) => api.sendMessage({
      recipient_id: peerId, client_message_id: entry.client_message_id, text: entry.text,
    }, options), (message) => {
      const outbox = { ...state.outbox }; delete outbox[peerId];
      const drafts = { ...state.drafts };
      if (drafts[peerId]?.trim() === entry.text) drafts[peerId] = '';
      patch({ outbox, drafts });
      if (state.view === 'chat' && state.targetId === peerId) {
        patch({ conversationId: message.conversation_id });
        emit({ type: 'messages', peerId, items: [message] });
      }
      void refreshAll();
    }, (error) => {
      patch({ outbox: { ...state.outbox, [peerId]: { ...entry, status: 'failed', error, retryAt: now() + (error.retryAfter || 0) * 1000 } } });
      if (['OBSERVATION_REQUIRED', 'DISCOVERY_DISABLED'].includes(error.code)) void refreshAll();
    });
  }
  return {
    getState: () => state, subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    start, dispose, navigate, refreshAll, scanNearby, loadConversations, loadChat,
    saveProfile, setDiscovery, setDraft, send,
    requestNativePermission: async () => {
      if (!native?.supported) return;
      const status = await native.requestPermission();
      if (open()) patch({ native: status });
      void refreshAll();
    },
    dismissNotice: () => patch({ notice: null }),
    resumeConnection: () => { if (state.me?.profile && open()) { connect(); void refreshAll(); } else if (open()) void start(); },
  };
}
