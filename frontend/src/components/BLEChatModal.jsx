import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Bluetooth, BluetoothOff, Send } from 'lucide-react';

const INITIAL_CHAT = [
  { me: true, t: '혹시 CI 구축해보셨다고 들었어요. 저 지금 배포 권한에서 막혀 있는데요' },
  { me: false, t: '아 네 작년에요. 어떤 에러예요?' },
  { me: true, t: 'Actions에서 빌드는 되는데 배포 단계에서 권한 오류가 나요' },
];

export default function BLEChatModal({
  partner,
  currentUser,
  onBack,
  btEnabled = true,
  onToggleBt = null,
}) {
  const [messages, setMessages] = useState(INITIAL_CHAT);
  const [inputText, setInputText] = useState('');
  const [isBtOn, setIsBtOn] = useState(btEnabled);
  const bubblesEndRef = useRef(null);

  useEffect(() => {
    setIsBtOn(btEnabled);
  }, [btEnabled]);

  useEffect(() => {
    bubblesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    const text = inputText.trim();
    if (!text) return;

    const newMsg = { me: true, t: text };
    setMessages((prev) => [...prev, newMsg]);
    setInputText('');

    // Send to backend endpoint for simulation
    try {
      fetch(`/api/room/${currentUser?.roomCode || 'KOSS26'}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id: currentUser?.id || 'me',
          target_id: partner?.id || 'minseo',
          text,
        }),
      });
    } catch (err) {
      // Offline direct simulation
    }

    // 900ms P2P direct response (위치 기반 만남 유도)
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { me: false, t: '창가 쪽에 있어요. 손 들게요' },
      ]);
    }, 900);
  };

  const partnerName = partner?.name || partner?.nick || '민서';
  const partnerSchool = partner?.school || '순천향대';

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', padding: '0 16px', background: 'var(--bg)' }}>
      {/* S5 Header */}
      <header
        className="row"
        style={{
          padding: '18px 0 12px',
          borderBottom: '1px solid var(--border)',
          gap: '10px',
        }}
      >
        <button
          onClick={onBack}
          aria-label="뒤로"
          style={{ width: '32px', height: '44px', display: 'flex', alignItems: 'center' }}
        >
          <ArrowLeft size={20} />
        </button>
        <div className="grow">
          <div className="t-lg" style={{ fontWeight: 600 }}>{partnerName}</div>
          <div className="t-sm faint">{partnerSchool}</div>
        </div>
        {isBtOn && (
          <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--open)' }}>
            <Bluetooth size={12} /> 직접 연결
          </span>
        )}
      </header>

      {/* Bluetooth Off State */}
      {!isBtOn ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="empty" style={{ padding: '20px' }}>
            <BluetoothOff size={36} color="var(--text-faint)" style={{ margin: '0 auto 14px' }} />
            <p className="t-md" style={{ margin: '0 0 6px', fontWeight: 600 }}>
              블루투스가 꺼져 있어요
            </p>
            <p className="t-sm dim" style={{ margin: '0 0 18px', lineHeight: 1.6 }}>
              대화는 기기끼리 직접 주고받습니다.
            </p>
            <button
              className="btn btn-ghost"
              style={{ width: 'auto', padding: '0 20px', height: '44px', margin: '0 auto' }}
              onClick={() => {
                setIsBtOn(true);
                if (onToggleBt) onToggleBt(true);
              }}
            >
              블루투스 켜기
            </button>
            <p className="t-sm faint" style={{ margin: '18px 0 0', lineHeight: 1.6 }}>
              꺼져 있어도 방 목록은 그대로 보입니다.
            </p>
          </div>
        </div>
      ) : (
        /* Chat Body */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <p className="sysline">
            방을 나가면 사라집니다. · 서버를 거치지 않습니다
          </p>

          <div className="bubbles">
            {messages.map((m, idx) => (
              <div key={idx} className={`b ${m.me ? 'me' : 'you'}`}>
                {m.t}
              </div>
            ))}
            <div ref={bubblesEndRef} />
          </div>

          <form onSubmit={handleSend} className="composer">
            <input
              id="msg"
              className="field"
              style={{ height: '44px' }}
              placeholder="메시지 (어디 계시는지 확인해보세요)"
              autoComplete="off"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              autoFocus
            />
            <button
              type="submit"
              aria-label="보내기"
              style={{ width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
