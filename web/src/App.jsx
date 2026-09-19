import { useEffect, useRef } from 'react';
import { useDiscovery } from './use-discovery.js';
import { ErrorNotice, Loading } from './components/Feedback.jsx';
import Entry from './screens/Entry.jsx';
import Nearby from './screens/Nearby.jsx';
import Detail from './screens/Detail.jsx';
import Chat from './screens/Chat.jsx';
import Conversations from './screens/Conversations.jsx';

export default function App() {
  const { state, actions } = useDiscovery();
  const main = useRef(null);
  const page = !state.me ? 'entry' : state.view;
  const connecting = state.me && state.connection !== 'connected';
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
  if (state.booting) screen = <section className="screen centered"><Loading text="내 정보를 확인하고 있어요" /></section>;
  else if (state.bootError) screen = <section className="screen centered"><h1 tabIndex={-1}>연결하지 못했어요</h1><ErrorNotice error={state.bootError} onRetry={actions.start} /></section>;
  else if (!state.me || state.view === 'profile') screen = <Entry key={state.me?.user_id ?? 'new'} />;
  else if (state.view === 'detail') screen = <Detail />;
  else if (state.view === 'chat') screen = <Chat key={state.targetId} />;
  else if (state.view === 'conversations') screen = <Conversations />;
  else screen = <Nearby />;

  return (
    <div id="app" style={{ '--connection-height': connecting ? '48px' : '0px' }}>
      <main ref={main} id="main-content">
        {state.notice && <div className="notice" role="status">{state.notice}<button className="text-button" onClick={actions.dismissNotice}>닫기</button></div>}
        {connecting && <p className="connection-status" role="status">{state.connection === 'connecting' ? '연결 중…' : '연결을 다시 확인하고 있어요. 저장된 내용은 유지됩니다.'}</p>}
        {screen}
      </main>
    </div>
  );
}
