// 전역 상태. 화면이 몇 개 안 되니 라이브러리 없이 useReducer + Context로 충분하다.
// 2026-09-19 전면 개편: 상태 선택·소속·접점 매칭(1명) 개념을 걷어내고 자기소개/
// 교류 의도, 전체 참가자 순위(recommendations), 상세 화면, 참여 중단/재개로 바꿨다.
import { createContext, useContext, useReducer, useCallback } from 'react';
import { api } from './api/index.js';
import * as bleChat from './lib/bleChat.js';

const ROOM_CODE = new URLSearchParams(window.location.search).get('r') || 'KOSS26';

// 새로고침해도 내가 누구였는지 잊지 않는다 — id 하나만 sessionStorage에 둔다.
// 탭·앱을 완전히 닫으면 사라진다. 새 탭에서 같은 링크를 열어도 별개 세션이다.
// (실제 서버는 영속 쿠키를 쓴다 — docs/api-contract.md 세션 2번. 여기선 세션
// 수준까지만 흉내내고 정확한 쿠키 수명은 T02가 정한다)
const SESSION_KEY = `bside:${ROOM_CODE}:me`;
function rememberMe(id) { sessionStorage.setItem(SESSION_KEY, id); }
function forgetMe() { sessionStorage.removeItem(SESSION_KEY); }
function recalledId() { return sessionStorage.getItem(SESSION_KEY); }

const initial = {
  code: ROOM_CODE,
  room: null, // RoomMeta | null
  me: null, // Participant | null. null이면 아직 입장 전
  editing: false, // true면 입장 화면이 "내 정보 수정" 모드
  participants: [], // 나를 제외한 active 참가자 전체 (배너용 원본 데이터)
  recommendations: [], // [{candidate_id, reason, state}] 순위 순서
  recommendationsLoading: false,
  selectedId: null, // 상세 화면에서 보고 있는 참가자 id
  selected: null, // {participant, recommendation} | null
  chatWith: null, // Participant | null
  chatMessages: [],
  restoring: true,
};

function reducer(state, action) {
  switch (action.type) {
    case 'ROOM_LOADED':
      return { ...state, room: action.room };
    case 'JOINED':
      return { ...state, me: action.me, editing: false };
    case 'ME_UPDATED':
      return { ...state, me: action.me, editing: false };
    case 'SESSION_RESTORED':
      return { ...state, me: action.me, restoring: false };
    case 'RESTORE_DONE':
      return { ...state, restoring: false };
    case 'PARTICIPANTS_LOADED':
      return { ...state, participants: action.participants };
    case 'RECS_LOADING':
      return { ...state, recommendationsLoading: true };
    case 'RECS_LOADED':
      return { ...state, recommendationsLoading: false, recommendations: action.recommendations };
    case 'START_EDIT':
      return { ...state, editing: true };
    case 'CANCEL_EDIT':
      return { ...state, editing: false };
    case 'PARTICIPANT_SELECTED':
      return { ...state, selectedId: action.id, selected: action.data };
    case 'PARTICIPANT_DESELECTED':
      return { ...state, selectedId: null, selected: null };
    case 'CHAT_OPENED':
      return { ...state, chatWith: action.participant, chatMessages: action.messages };
    case 'CHAT_CLOSED':
      return { ...state, chatWith: null, chatMessages: [] };
    case 'CHAT_MESSAGE_ADDED':
      return { ...state, chatMessages: [...state.chatMessages, action.message] };
    default:
      return state;
  }
}

const Ctx = createContext(null);

export function RoomProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initial);

  const loadRoom = useCallback(async () => {
    const room = await api.getRoom(state.code);
    dispatch({ type: 'ROOM_LOADED', room });
    return room;
  }, [state.code]);

  const loadParticipants = useCallback(async () => {
    const participants = await api.getParticipants(state.code, state.me?.id);
    dispatch({ type: 'PARTICIPANTS_LOADED', participants });
    return participants;
  }, [state.code, state.me]);

  const loadRecommendations = useCallback(async () => {
    if (!state.me) return;
    dispatch({ type: 'RECS_LOADING' });
    const recommendations = await api.getRecommendations(state.code, state.me.id);
    dispatch({ type: 'RECS_LOADED', recommendations });
    return recommendations;
  }, [state.code, state.me]);

  const join = useCallback(async (payload) => {
    const me = await api.join(state.code, payload);
    rememberMe(me.id);
    dispatch({ type: 'JOINED', me });
    return me;
  }, [state.code]);

  const updateMe = useCallback(async (payload) => {
    const me = await api.updateMe(state.code, state.me.id, payload);
    dispatch({ type: 'ME_UPDATED', me });
    return me;
  }, [state.code, state.me]);

  const stopParticipating = useCallback(async () => {
    const me = await api.stop(state.code, state.me.id);
    dispatch({ type: 'ME_UPDATED', me });
    return me;
  }, [state.code, state.me]);

  const resumeParticipating = useCallback(async () => {
    const me = await api.resume(state.code, state.me.id);
    dispatch({ type: 'ME_UPDATED', me });
    return me;
  }, [state.code, state.me]);

  // 새로고침 복원. App.jsx가 마운트 시 한 번만 부른다.
  const restoreSession = useCallback(async () => {
    const id = recalledId();
    if (!id) { dispatch({ type: 'RESTORE_DONE' }); return; }
    const me = await api.getMe(state.code, id);
    if (!me) { forgetMe(); dispatch({ type: 'RESTORE_DONE' }); return; }
    dispatch({ type: 'SESSION_RESTORED', me });
  }, [state.code]);

  const startEdit = useCallback(() => dispatch({ type: 'START_EDIT' }), []);
  const cancelEdit = useCallback(() => dispatch({ type: 'CANCEL_EDIT' }), []);

  const selectParticipant = useCallback(async (id) => {
    const data = await api.getParticipant(state.code, state.me.id, id);
    dispatch({ type: 'PARTICIPANT_SELECTED', id, data });
  }, [state.code, state.me]);
  const deselectParticipant = useCallback(() => dispatch({ type: 'PARTICIPANT_DESELECTED' }), []);

  const openChat = useCallback(async (participant) => {
    const messages = await bleChat.getInitialMessages();
    dispatch({ type: 'CHAT_OPENED', participant, messages });
  }, []);
  const closeChat = useCallback(() => dispatch({ type: 'CHAT_CLOSED' }), []);

  const sendChatMessage = useCallback(async (text) => {
    const mine = await bleChat.sendMessage(text);
    dispatch({ type: 'CHAT_MESSAGE_ADDED', message: mine });
    const reply = await bleChat.fakeReply();
    dispatch({ type: 'CHAT_MESSAGE_ADDED', message: reply });
  }, []);

  const value = {
    state, loadRoom, loadParticipants, loadRecommendations, join, updateMe,
    stopParticipating, resumeParticipating, restoreSession, startEdit, cancelEdit,
    selectParticipant, deselectParticipant, openChat, closeChat, sendChatMessage,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRoom() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useRoom은 RoomProvider 안에서만 쓸 수 있다');
  return ctx;
}
