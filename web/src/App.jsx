import { useEffect } from 'react';
import { useRoom } from './state.jsx';
import Entry from './screens/Entry.jsx';
import Room from './screens/Room.jsx';
import Chat from './screens/Chat.jsx';
import Dashboard from './screens/Dashboard.jsx';
import Ended from './screens/Ended.jsx';

// 운영진 전용 별도 진입(PRD 6장). 로그인을 새로 만들지 않으니 참가자 화면이 아닌
// 다른 URL로만 구분한다 — 실제 배포에선 이 링크를 운영진에게만 공유하는 식이 된다.
const IS_DASHBOARD = new URLSearchParams(window.location.search).get('view') === 'dashboard';
// 데모/테스트용. endsAt까지 실제로 기다리지 않고 "이미 끝난 방" 상태를 바로 본다.
const FORCE_ENDED = new URLSearchParams(window.location.search).get('ended') === '1';

export default function App() {
  const { state, loadRoom, loadMembers, restoreSession } = useRoom();

  // 방 정보와 목록은 입장 전부터 필요하다 — 입장 화면의 "N명이 올려뒀어요" 안내가
  // 이 목록 길이에서 나온다 (남의 한 줄은 안 보여주고 숫자만 쓴다).
  // restoreSession은 새로고침 복원 — sessionStorage에 내 id가 남아있으면 다시
  // Entry로 안 보내고 곧장 방으로 돌려보낸다.
  useEffect(() => {
    loadRoom();
    loadMembers();
    restoreSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // room이 오기 전에 Entry를 마운트하면 안 된다: Entry의 소속 입력 useState가
  // room.aff.options로 초기화되는데, 그 시점에 room이 비어 있으면 이후 room이
  // 도착해도 초기값이 다시 계산되지 않는다(리렌더는 되지만 useState 초기화는
  // 최초 1회뿐). "국민대"가 화면엔 보이는데 실제 값은 빈 문자열인 채로 굳는
  // 버그로 나타났다 — 실기기 테스트로 잡았다.
  // restoring도 같이 기다린다 — 안 그러면 복원되기 직전에 Entry가 한 프레임
  // 깜빡 보였다가 방으로 넘어간다.
  if (!state.room || state.restoring) return <div id="app" />;

  if (IS_DASHBOARD) return <div id="app"><Dashboard /></div>;

  // 종료는 참가자 쪽에만 적용한다. 대시보드는 행사가 끝난 뒤에도 봐야 한다
  // (재계약 근거 리포트가 그 시점에 나온다 — protocol.md 2-1번)
  if (state.room.ended || FORCE_ENDED) return <div id="app"><Ended title={state.room.title} /></div>;

  const showEntry = !state.me || state.editing;

  return (
    <div id="app">
      {state.chatWith ? <Chat /> : showEntry ? <Entry /> : <Room />}
    </div>
  );
}
