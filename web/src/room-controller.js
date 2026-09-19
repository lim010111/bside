import { ApiError, mergeMessages, validReason } from './lib/contracts.js';

export const initialState = (code) => ({
  code, room: null, me: null, booting: true, bootError: null, notice: null,
  view: 'people', targetId: null, busy: null,
  participants: [], candidateVersion: null, peopleLoading: true, peopleError: null,
  recommendations: null, recommendationState: 'pending', recommendationError: null, retryAt: 0,
  detail: null, detailLoading: false, detailError: null,
  conversations: [], conversationsLoading: true, conversationsError: null,
  peer: null, conversationId: null, messages: [], chatLoading: false, chatError: null,
  hasOlder: false, loadingOlder: false, historyCursor: null, outbox: {}, drafts: {},
  connection: 'connecting',
});

export function roomReducer(state, action) {
  if (action.type === 'closed') return {
    ...initialState(state.code), booting: false, peopleLoading: false, connection: 'closed',
    room: { ...(state.room ?? { name: '이' }), status: 'closed' },
  };
  // No late response can repopulate a closed room.
  if (state.room?.status === 'closed') return state;
  if (action.type === 'patch') return { ...state, ...action.value };
  if (action.type === 'messages') {
    if (state.targetId !== action.peerId || state.view !== 'chat') return state;
    return { ...state, messages: mergeMessages(state.messages, action.items) };
  }
  return state;
}

// Framework-independent controller: async ownership, retries and closure are tested here.
export function createRoomController({ api, code, route = () => ({ view: 'people' }), writeRoute = () => {}, now = Date.now }) {
  let state = initialState(code);
  const listeners = new Set(), requests = new Map();
  let epoch = 0, alive = false, unsubscribeEvents, fallbackTimer, refreshTimer;
  let refreshRunning = false, refreshAgain = false, streamReady = false;
  let historyRunning = false, historyAgain = false;
  const emit = (action) => {
    state = roomReducer(state, action);
    for (const listener of listeners) listener(state);
  };
  const patch = (value) => emit({ type: 'patch', value });
  const open = () => alive && state.room?.status !== 'closed';
  function cancelRequests() {
    for (const request of requests.values()) request.controller.abort();
    requests.clear();
  }
  function cancelScope(scope) {
    requests.get(scope)?.controller.abort();
    requests.delete(scope);
  }
  function disconnect() {
    unsubscribeEvents?.(); unsubscribeEvents = null;
    clearTimeout(fallbackTimer); clearInterval(refreshTimer);
  }
  function closeRoom() {
    epoch++; cancelRequests(); disconnect();
    emit({ type: 'closed' });
  }
  function errorBoundary(error) {
    if (error.code === 'ROOM_CLOSED') closeRoom();
    else if (['SESSION_REQUIRED', 'PARTICIPATION_REQUIRED'].includes(error.code)) {
      epoch++; cancelRequests(); disconnect();
      patch({ ...initialState(code), room: state.room, booting: false,
        notice: '참여 정보를 다시 확인해 주세요.', connection: 'offline' });
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
        if (scope !== 'boot' || error.code === 'ROOM_CLOSED') errorBoundary(error);
        if (open() && ownEpoch === epoch) failure?.(error);
      }
      return undefined;
    } finally {
      if (requests.get(scope) === token) requests.delete(scope);
    }
  }
  function applyMe(me) {
    if (!me) {
      errorBoundary(new ApiError('PARTICIPATION_REQUIRED', '참여 정보를 입력해 주세요.'));
      return;
    }
    if (state.me && me.profile_version < state.me.profile_version) return;
    const changed = state.me && me.profile_version !== state.me.profile_version;
    patch({ me, ...(changed ? { recommendations: null, recommendationState: 'pending', detail: state.detail ? { ...state.detail, recommendation: null } : null } : {}) });
  }
  async function loadPeople() {
    await request('people', (options) => api.getParticipants(code, options), (result) => {
      if (state.candidateVersion !== null && result.candidate_version < state.candidateVersion) return;
      patch({
        participants: result.items, candidateVersion: result.candidate_version,
        peopleLoading: false, peopleError: null, recommendationState: result.recommendation_state,
        ...(result.candidate_version !== state.candidateVersion ? { recommendations: null, detail: state.detail ? { ...state.detail, recommendation: null } : null } : {}),
      });
    }, (error) => patch({ peopleLoading: false, peopleError: error }));
  }
  async function loadRecommendations() {
    const version = state.me?.profile_version;
    await request('recommendations', (options) => api.getRecommendations(code, options), (result) => {
      if (state.me?.profile_version !== version || (state.candidateVersion !== null && result.candidate_version !== state.candidateVersion)) return;
      patch({ recommendations: result, recommendationState: result.state, recommendationError: null });
    }, (error) => patch({ recommendations: null, recommendationState: 'failed', recommendationError: error }));
  }
  async function loadDetail() {
    const id = state.targetId, version = state.me?.profile_version;
    if (state.view !== 'detail' || !id) return;
    await request('detail', (options) => api.getParticipant(code, id, options), (result) => {
      if (state.view !== 'detail' || state.targetId !== id || state.me?.profile_version !== version) return;
      patch({ detail: { ...result, recommendation: validReason(result, state.me) ? result.recommendation : { ...result.recommendation, reason: null } }, detailLoading: false, detailError: null });
    }, (error) => { if (state.targetId === id) patch({ detailLoading: false, detailError: error }); });
  }
  async function loadConversations() {
    await request('conversations', (options) => api.getConversations(code, options), (result) => {
      const active = result.items.find((c) => c.peer.id === state.targetId);
      patch({ conversations: result.items, conversationsLoading: false, conversationsError: null,
        ...(state.view === 'chat' && active ? { conversationId: active.id, peer: active.peer } : {}) });
    }, (error) => patch({ conversationsLoading: false, conversationsError: error }));
  }
  async function loadChat() {
    const id = state.targetId;
    if (state.view !== 'chat' || !id) return;
    await request('peer', (options) => api.getParticipant(code, id, options), (result) => {
      if (state.view === 'chat' && state.targetId === id) patch({ peer: result.participant });
    }, (error) => { if (state.targetId === id) patch({ chatError: error, chatLoading: false }); });
    await loadConversations();
    if (state.view === 'chat' && state.targetId === id) await syncHistory();
  }
  // A watermark is advanced only by history pages, never by a send response.
  // This avoids skipping a peer's message racing with our own send.
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
        const cursor = state.historyCursor;
        await request('history', async (options) => {
          const query = cursor === null ? {} : { after_seq: cursor };
          let page = await api.getMessages(code, conversation, query, options);
          let items = page.items, last = page.next_after_seq ?? cursor ?? 0;
          const hasOlder = cursor === null ? page.has_more : state.hasOlder;
          // Initial page starts at the latest window. Catch-up pages are exhaustive.
          while (cursor !== null && page.has_more) {
            if (!page.items.length || page.next_after_seq <= (query.after_seq ?? -1)) throw new ApiError('INVALID_RESPONSE', '대화 이력을 다시 불러와 주세요.');
            query.after_seq = page.next_after_seq;
            page = await api.getMessages(code, conversation, query, options);
            items = mergeMessages(items, page.items);
            last = page.next_after_seq ?? last;
          }
          return { items, last, hasOlder };
        }, ({ items, last, hasOlder }) => {
          if (state.view !== 'chat' || state.targetId !== id || state.conversationId !== conversation) return;
          emit({ type: 'messages', peerId: id, items });
          patch({ historyCursor: last, hasOlder, chatLoading: false, chatError: null });
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
        await request('room', (options) => api.getRoom(code, options), (room) => {
          if (room.status === 'closed') closeRoom(); else patch({ room });
        }, () => patch({ connection: 'offline' }));
        if (!open() || ownEpoch !== epoch) break;
        await request('me', (options) => api.getMe(code, options), applyMe, (error) => patch({ notice: error.message }));
        if (!state.me || !open() || ownEpoch !== epoch) break;
        await Promise.all([loadPeople(), loadConversations()]);
        if (!open() || ownEpoch !== epoch) break;
        await loadRecommendations();
        if (state.view === 'detail') await loadDetail();
        if (state.view === 'chat') await loadChat();
      } while (refreshAgain && open() && ownEpoch === epoch);
    } finally {
      refreshRunning = false;
      if (refreshAgain && open() && state.me) { refreshAgain = false; void refreshAll(); }
    }
  }
  function connect() {
    disconnect();
    streamReady = false;
    patch({ connection: 'connecting' });
    const onError = () => {
      if (!open()) return;
      streamReady = false;
      patch({ connection: 'reconnecting' });
    };
    try {
      unsubscribeEvents = api.subscribe(code, ({ type, data }) => {
        if (!open()) return;
        if (type === 'room.closed' || data?.room_status === 'closed') { closeRoom(); return; }
        if (type === 'ready') {
          streamReady = true; clearTimeout(fallbackTimer); patch({ connection: 'connected' });
        }
        if (type === 'participants.changed' || type === 'self.changed') {
          patch({ recommendations: null, recommendationState: 'pending', detail: state.detail ? { ...state.detail, recommendation: null } : null });
        }
        if (streamReady) void refreshAll();
      }, onError);
    } catch { onError(); }
    // If SSE cannot establish, REST remains usable and polling covers missed events.
    fallbackTimer = setTimeout(() => { if (open() && !streamReady) { onError(); void refreshAll(); } }, 5000);
    refreshTimer = setInterval(() => {
      if (open() && globalThis.document?.visibilityState !== 'hidden') void refreshAll();
    }, 15000);
  }
  async function start() {
    alive = true; epoch++; cancelRequests(); disconnect();
    if (state.room?.status === 'closed') return;
    patch({ booting: true, bootError: null });
    await request('boot', async (options) => {
      const room = await api.getRoom(code, options);
      if (room.status === 'closed') return { room, me: null };
      await api.ensureSession(options);
      const me = await api.getMe(code, options);
      return { room, me };
    }, ({ room, me }) => {
      if (room.status === 'closed') { patch({ room }); closeRoom(); return; }
      patch({ room, me, booting: false });
      if (me) { navigate(route().view, route().id, false); connect(); }
    }, (error) => patch({ booting: false, bootError: error }));
  }
  function dispose() { alive = false; epoch++; cancelRequests(); disconnect(); }
  function navigate(view = 'people', id = null, write = true) {
    if (!open()) return;
    const allowed = ['people', 'profile', 'detail', 'chat', 'conversations'];
    if (!allowed.includes(view) || (['detail', 'chat'].includes(view) && !id)) { view = 'people'; id = null; }
    const changing = state.view !== view || state.targetId !== id;
    patch({ view, targetId: id, notice: null, ...(changing ? {
      detail: null, detailLoading: view === 'detail', detailError: null,
      peer: null, conversationId: null, messages: [], historyCursor: null,
      chatLoading: view === 'chat', chatError: null, hasOlder: false,
    } : {}) });
    if (write) writeRoute({ view, id });
    if (!state.me || (!streamReady && state.connection !== 'reconnecting')) return;
    if (view === 'detail') void loadDetail();
    if (view === 'chat') void loadChat();
    if (view === 'conversations') void loadConversations();
  }
  async function mutate(kind, payload) {
    if (state.busy || !open()) return { ok: false };
    patch({ busy: kind, notice: null });
    let outcome = { ok: false };
    await request('mutation', async (options) => {
      if (kind === 'join') { await api.ensureSession(options); return api.join(code, payload, options); }
      if (kind === 'updateMe') return api.updateMe(code, payload, options);
      return api[kind](code, options);
    }, (me) => {
      // A pre-mutation /me response can have the same profile version but an old
      // participation status. Do not let it undo a completed stop or resume.
      cancelScope('me');
      applyMe(me); patch({ busy: null, recommendations: null, recommendationState: 'pending' });
      outcome = { ok: true };
      if (kind === 'join') { navigate('people'); connect(); }
      else { if (kind === 'updateMe') navigate('people'); void refreshAll(); }
    }, (error) => {
      patch({ busy: null });
      outcome = { ok: false, error };
      if (error.code === 'VERSION_CONFLICT') void request('me', (options) => api.getMe(code, options), applyMe);
      if (error.code === 'PARTICIPATION_STOPPED') void refreshAll();
    });
    return outcome;
  }
  async function retryRecommendations() {
    if (!open() || state.busy || now() < state.retryAt) return;
    patch({ retryAt: now() + 5000, recommendationState: 'pending', recommendationError: null });
    await request('retry-recommendations', (options) => api.refreshRecommendations(code, options),
      () => { void refreshAll(); },
      (error) => patch({ recommendationState: 'failed', recommendationError: error, retryAt: now() + Math.max(error.retryAfter || 5, 5) * 1000 }));
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
    await request('send:' + peerId, (options) => api.sendMessage(code, {
      recipient_id: peerId, client_message_id: entry.client_message_id, text: entry.text,
    }, options), ({ message }) => {
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
      if (error.code === 'PARTICIPATION_STOPPED') void refreshAll();
    });
  }
  async function loadOlder() {
    if (!state.conversationId || state.loadingOlder || !state.hasOlder) return;
    const id = state.targetId, conversation = state.conversationId;
    patch({ loadingOlder: true });
    await request('older', (options) => api.getMessages(code, conversation, { before_seq: state.messages[0].seq }, options), (page) => {
      if (state.view !== 'chat' || state.targetId !== id) return;
      emit({ type: 'messages', peerId: id, items: page.items });
      patch({ loadingOlder: false, hasOlder: page.has_more });
    }, (error) => patch({ loadingOlder: false, chatError: error }));
  }
  return {
    getState: () => state, subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    start, dispose, navigate, refreshAll, loadDetail, loadConversations, loadChat, loadOlder,
    mutate, retryRecommendations, setDraft, send,
    dismissNotice: () => patch({ notice: null }),
    resumeConnection: () => { if (state.me && open()) { connect(); } else if (open()) void start(); },
  };
}
