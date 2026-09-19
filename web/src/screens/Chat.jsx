// 채팅 화면. 2026-09-19 전면 개편으로 BLE 직접 채팅을 걷어내고 서버 저장
// 채팅(REST + SSE)으로 바꿨다 — "실제 채팅은 서버가 저장하므로 '서버에 메시지가
// 남지 않는다'고 안내하지 않는다"(spec/protocol.md). 지금은 lib/bleChat.js가
// 여전히 메시지를 들고 있는 mock이고, T06에서 실제 서버 저장·SSE로 옮긴다 —
// 그때도 이 화면의 마크업은 거의 안 바뀐다, sendChatMessage 안쪽만 API 호출로 바뀐다.
import { useEffect, useRef, useState } from 'react';
import { useRoom } from '../state.jsx';

export default function Chat() {
  const { state, closeChat, sendChatMessage } = useRoom();
  const { chatWith: peer, chatMessages } = state;

  const [draft, setDraft] = useState('');
  const bubblesRef = useRef(null);

  useEffect(() => {
    bubblesRef.current?.scrollTo(0, bubblesRef.current.scrollHeight);
  }, [chatMessages]);

  if (!peer) return null;

  function submit() {
    const v = draft.trim();
    if (!v) return;
    setDraft('');
    sendChatMessage(v);
  }

  return (
    <section className="screen on screen-chat">
      <header className="row" style={{ padding: '18px 0 12px', borderBottom: '1px solid var(--border)', gap: 10 }}>
        <button type="button" onClick={closeChat} aria-label="뒤로" style={{ width: 32, height: 44, display: 'flex', alignItems: 'center' }}>
          <svg className="ic lg"><use href="#i-back" /></svg>
        </button>
        <div className="grow">
          <div className="t-lg">{peer.nickname}</div>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <p className="sysline">행사가 끝날 때까지 대화가 남아있어요. 앱을 닫아도 사라지지 않아요.</p>
        <div className="bubbles" ref={bubblesRef}>
          {chatMessages.map((m, i) => (
            <div key={i} className={`b ${m.me ? 'me' : 'you'}`}>{m.t}</div>
          ))}
        </div>
        <div className="composer">
          <input
            className="field" style={{ height: 44 }} placeholder="메시지" autoComplete="off"
            value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
          <button type="button" onClick={submit} aria-label="보내기"
            style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg className="ic lg"><use href="#i-send" /></svg>
          </button>
        </div>
      </div>
    </section>
  );
}
