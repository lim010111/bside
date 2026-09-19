import { useEffect } from 'react';
import { useRoom } from './state.jsx';
import Entry from './screens/Entry.jsx';
import Room from './screens/Room.jsx';
import Chat from './screens/Chat.jsx';
import Dashboard from './screens/Dashboard.jsx';

// 운영진 전용 별도 진입(PRD 6장). 로그인을 새로 만들지 않으니 참가자 화면이 아닌
// 다른 URL로만 구분한다 — 실제 배포에선 이 링크를 운영진에게만 공유하는 식이 된다.
const IS_DASHBOARD = new URLSearchParams(window.location.search).get('view') === 'dashboard';

export default function App() {
  const { state, loadRoom, loadMembers } = useRoom();

  // 방 정보와 목록은 입장 전부터 필요하다 — 입장 화면의 "N명이 올려뒀어요" 안내가
  // 이 목록 길이에서 나온다 (남의 한 줄은 안 보여주고 숫자만 쓴다)
  useEffect(() => {
    loadRoom();
    loadMembers();
  }, [loadRoom, loadMembers]);

  // room이 오기 전에 Entry를 마운트하면 안 된다: Entry의 소속 입력 useState가
  // room.aff.options로 초기화되는데, 그 시점에 room이 비어 있으면 이후 room이
  // 도착해도 초기값이 다시 계산되지 않는다(리렌더는 되지만 useState 초기화는
  // 최초 1회뿐). "국민대"가 화면엔 보이는데 실제 값은 빈 문자열인 채로 굳는
  // 버그로 나타났다 — 실기기 테스트로 잡았다.
  if (!state.room) return <div id="app" />;

  if (IS_DASHBOARD) return <div id="app"><Dashboard /></div>;

  const showEntry = !state.me || state.editing;

  return (
    <div id="app">
      {state.chatWith ? <Chat /> : showEntry ? <Entry /> : <Room />}
    </div>
  );
}
