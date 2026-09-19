import { useEffect, useRef } from 'react';
import { useRoom } from './use-room.js';
import { isDemo } from './api/index.js';
import { ErrorNotice, Loading } from './components/Feedback.jsx';
import Entry from './screens/Entry.jsx';
import Room from './screens/Room.jsx';
import Detail from './screens/Detail.jsx';
import Chat from './screens/Chat.jsx';
import Conversations from './screens/Conversations.jsx';
import Dashboard from './screens/Dashboard.jsx';
import Ended from './screens/Ended.jsx';

const dashboard = new URLSearchParams(window.location.search).get('view') === 'dashboard';

export default function App() {
  const { state, actions } = useRoom();
  const main = useRef(null);
  const page = state.room?.status === 'closed' ? 'ended' : !state.me ? 'entry' : state.view;
  const connecting = state.me && !['connected', 'closed'].includes(state.connection);
  useEffect(() => {
    document.title = state.room ? state.room.name + ' · Bside' : 'Bside';
  }, [state.room]);
  useEffect(() => {
    if (state.booting) return;
    window.scrollTo(0, 0);
    main.current?.querySelector('h1')?.focus({ preventScroll: true });
  }, [page, state.targetId, state.booting]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => document.documentElement.style.setProperty('--viewport-height', (viewport?.height ?? window.innerHeight) + 'px');
    update();
    viewport?.addEventListener('resize', update);
    return () => viewport?.removeEventListener('resize', update);
  }, []);

  let screen;
  if (state.room?.status === 'closed') screen = <Ended title={state.room.name} />;
  else if (state.booting) screen = <section className="screen centered"><Loading text="행사 정보를 확인하고 있어요" /></section>;
  else if (state.bootError) screen = <section className="screen centered"><h1 tabIndex={-1}>행사에 연결하지 못했어요</h1><ErrorNotice error={state.bootError} onRetry={actions.start} /></section>;
  else if (dashboard) screen = <Dashboard />;
  else if (!state.me || state.view === 'profile') screen = <Entry key={state.me?.id ?? 'join'} />;
  else if (state.view === 'detail') screen = <Detail />;
  else if (state.view === 'chat') screen = <Chat key={state.targetId} />;
  else if (state.view === 'conversations') screen = <Conversations />;
  else screen = <Room />;

  return (
    <div id="app" className={isDemo ? 'is-demo' : ''} style={{ '--connection-height': connecting ? '48px' : '0px' }}>
      {isDemo && <aside className="demo-banner"><span className="demo-label">DEMO</span><span>예시 참가자 · 이 브라우저에만 저장됩니다</span></aside>}
      <main ref={main} id="main-content">
        {state.notice && <div className="notice" role="status">{state.notice}<button className="text-button" onClick={actions.dismissNotice}>닫기</button></div>}
        {connecting && <p className="connection-status" role="status">{state.connection === 'connecting' ? '연결 중…' : '연결을 다시 확인하고 있어요. 저장된 내용은 유지됩니다.'}</p>}
        {screen}
      </main>
    </div>
  );
}
