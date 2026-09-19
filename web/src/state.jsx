// 전역 상태. 화면이 둘뿐이라 라이브러리 없이 useReducer + Context로 충분하다.
// (spec/frontend-plan.md 2번 결정 — Redux/Zustand 도입 금지)
import { createContext, useContext, useReducer, useCallback } from 'react';
import { api } from './api/index.js';
import * as bleChat from './lib/bleChat.js';

const ROOM_CODE = new URLSearchParams(window.location.search).get('r') || 'KOSS26';

const initial = {
  code: ROOM_CODE,
  room: null, // RoomMeta | null — getRoom() 응답
  me: null, // 내가 올린 상태. null이면 아직 입장 전
  editing: false, // true면 입장 화면이 "수정" 모드 (이미 me가 있는 상태에서 재진입)
  members: [], // 나를 제외한 목록
  t0: null, // 내가 방에 들어온 시각. 만료 계산의 기준
  match: null, // Match | null
  matchLoading: false,
  matchChecked: false, // 한 번 조회했으면 다시 안 한다 (편집 취소로 Room이 재마운트돼도)
  chatWith: null, // Member | null — 채팅 중인 상대. null이면 방 화면
  chatMessages: [],
  bleConnected: true, // 9단계 전까진 항상 true. 실제 BLE 상태 감지는 Capacitor에서
};

function reducer(state, action) {
  switch (action.type) {
    case 'ROOM_LOADED':
      return { ...state, room: action.room };
    case 'JOINED':
      return { ...state, me: action.me, editing: false, t0: Date.now(), match: null };
    case 'STATUS_UPDATED':
      // prototype의 saveStatus()는 수정 때도 S.t0 = Date.now()를 다시 찍는다.
      // 수정도 "아직 여기 있다"는 신호라서 내 만료 시계가 5분으로 되돌아간다.
      return { ...state, me: action.me, editing: false, t0: Date.now() };
    case 'MEMBERS_LOADED':
      return { ...state, members: action.members };
    case 'START_EDIT':
      return { ...state, editing: true };
    case 'CANCEL_EDIT':
      return { ...state, editing: false };
    case 'MATCH_LOADING':
      return { ...state, matchLoading: true, matchChecked: true };
    case 'MATCH_LOADED':
      return { ...state, matchLoading: false, match: action.match };
    case 'CHAT_OPENED':
      return { ...state, chatWith: action.member, chatMessages: action.messages };
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

  const loadMembers = useCallback(async () => {
    const members = await api.getMembers(state.code);
    dispatch({ type: 'MEMBERS_LOADED', members });
    return members;
  }, [state.code]);

  const join = useCallback(async (payload) => {
    const me = await api.join(state.code, payload);
    dispatch({ type: 'JOINED', me });
    await loadMembers();
    return me;
  }, [state.code, loadMembers]);

  const updateStatus = useCallback(async (payload) => {
    const me = await api.updateStatus(state.code, state.me.id, payload);
    dispatch({ type: 'STATUS_UPDATED', me });
    return me;
  }, [state.code, state.me]);

  const startEdit = useCallback(() => dispatch({ type: 'START_EDIT' }), []);
  const cancelEdit = useCallback(() => dispatch({ type: 'CANCEL_EDIT' }), []);

  const loadMatch = useCallback(async () => {
    dispatch({ type: 'MATCH_LOADING' });
    const match = await api.getMatch(state.code, state.me.id);
    dispatch({ type: 'MATCH_LOADED', match });
    return match;
  }, [state.code, state.me]);

  const openChat = useCallback(async (member) => {
    const messages = await bleChat.getInitialMessages();
    dispatch({ type: 'CHAT_OPENED', member, messages });
  }, []);
  const closeChat = useCallback(() => dispatch({ type: 'CHAT_CLOSED' }), []);

  const sendChatMessage = useCallback(async (text) => {
    const mine = await bleChat.sendMessage(text);
    dispatch({ type: 'CHAT_MESSAGE_ADDED', message: mine });
    // 실제 BLE라면 상대 기기가 알아서 보낸다 — 여긴 데모용 자동 응답
    const reply = await bleChat.fakeReply();
    dispatch({ type: 'CHAT_MESSAGE_ADDED', message: reply });
  }, []);

  const value = {
    state, loadRoom, loadMembers, join, updateStatus, startEdit, cancelEdit, loadMatch,
    openChat, closeChat, sendChatMessage,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRoom() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useRoom은 RoomProvider 안에서만 쓸 수 있다');
  return ctx;
}
