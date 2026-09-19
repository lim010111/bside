// 채팅 화면. prototype의 S5(257~291줄) + toChat/paintBt/btOn/renderChat/send(807~832줄)를 옮긴 것.
//
// 여기서 오가는 메시지는 서버를 거치지 않는다는 게 제품의 핵심 주장이다
// (spec/protocol.md 0번). 그래서 메시지 전송은 api/가 아니라 lib/bleChat.js를 쓴다 —
// 9단계에서 그 파일만 실제 BLE GATT 호출로 바뀌고, 이 화면 코드는 안 바뀐다.
import { useEffect, useRef, useState } from 'react';
import { useRoom } from '../state.jsx';

export default function Chat() {
  const { state, closeChat, sendChatMessage } = useRoom();
  const { chatWith: peer, chatMessages, bleConnected } = state;

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
          <div className="t-lg">{peer.name}</div>
          <div className="t-sm faint">{peer.school}</div>
        </div>
        {bleConnected && (
          <span className="badge">
            <svg className="ic" style={{ width: 12, height: 12, verticalAlign: -2 }}><use href="#i-bt" /></svg> 직접 연결
          </span>
        )}
      </header>

      {!bleConnected ? (
        <div className="empty">
          <svg className="ic"><use href="#i-btoff" /></svg>
          <p className="t-md" style={{ margin: '0 0 6px' }}>블루투스가 꺼져 있어요</p>
          <p className="t-sm dim" style={{ margin: '0 0 18px', lineHeight: 1.6 }}>대화는 기기끼리 직접 주고받습니다.</p>
          <p className="t-sm faint" style={{ margin: '18px 0 0', lineHeight: 1.6 }}>꺼져 있어도 방 목록은 그대로 보입니다.</p>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <p className="sysline">방을 나가면 사라집니다.</p>
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
      )}
    </section>
  );
}
