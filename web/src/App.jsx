import { useEffect } from 'react';
import { useRoom } from './state.jsx';
import Entry from './screens/Entry.jsx';
import Room from './screens/Room.jsx';
import Detail from './screens/Detail.jsx';
import Chat from './screens/Chat.jsx';
import Dashboard from './screens/Dashboard.jsx';
import Ended from './screens/Ended.jsx';

// 운영진 전용 별도 진입. 로그인을 새로 만들지 않으니 참가자 화면이 아닌
// 다른 URL로만 구분한다. team-plan.md는 대시보드를 개발 우선순위에서
// 뺐지만(운영진 대시보드는 배정하지 않는다) 화면 자체는 남겨둔다.
const IS_DASHBOARD = new URLSearchParams(window.location.search).get('view') === 'dashboard';

export default function App() {
  const { state, loadRoom, restoreSession } = useRoom();

  useEffect(() => {
    loadRoom();
    restoreSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // room이 오기 전에 다른 화면을 마운트하면 안 된다 — 실기기 테스트로 잡았던
  // 경쟁 조건(소속 select 초기값 버그)과 같은 종류의 함정이라 그대로 지킨다.
  // restoring도 같이 기다린다: 안 그러면 복원 직전에 Entry가 한 프레임 깜빡인다.
  if (!state.room || state.restoring) return <div id="app" />;

  if (IS_DASHBOARD) return <div id="app"><Dashboard /></div>;

  // 종료는 참가자 쪽에만 적용한다. 대시보드는 행사가 끝난 뒤에도 봐야 한다.
  if (state.room.status === 'closed') return <div id="app"><Ended title={state.room.title} /></div>;

  const showEntry = !state.me || state.editing;

  return (
    <div id="app">
      {state.chatWith ? <Chat />
        : showEntry ? <Entry />
        : state.selectedId ? <Detail />
        : <Room />}
    </div>
  );
}
