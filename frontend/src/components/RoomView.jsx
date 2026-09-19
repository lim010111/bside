import React, { useState, useEffect } from 'react';
import { BarChart3, LogOut, Sparkles } from 'lucide-react';

const STATUS_LABELS = {
  LOOKING_FOR: '이런 분 찾아요',
  CAN_SHARE: '이런 얘기 할 수 있어요',
  FIRST_TIME: '처음 왔어요',
  OPEN: '대화 가능',
  // Short
  SHORT_LOOKING_FOR: '찾는 중',
  SHORT_CAN_SHARE: '나눌 수 있음',
  SHORT_FIRST_TIME: '처음',
  SHORT_OPEN: '대화 가능',
};

const TTL = 300; // 300 seconds

export default function RoomView({
  roomData,
  currentUser,
  onEditMine,
  onOpenAdmin,
  onLeave,
  onSelectMemberForMatch,
  matchState = '',
  onRunMatch = null,
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const members = roomData?.members || [];
  const compo = roomData?.compo || [];
  const tally = roomData?.tally || '찾는 중 12 · 나눌 수 있음 15 · 처음 10 · 대화 가능 8';
  const headcount = roomData?.headcount || `${members.length + 1}명`;

  // Filter out current user from members list if present
  const otherMembers = members.filter((m) => m.id !== currentUser?.id && m.id !== 'me');

  const nearMembers = otherMembers.filter((m) => m.near);
  const farMembers = otherMembers.filter((m) => !m.near);

  const myAge = currentUser?.age || 0;
  const myLife = Math.max(0, 1 - myAge / TTL);
  const myMinutesLeft = Math.max(1, Math.ceil((myLife * TTL) / 60));

  const getFadeOpacity = (age = 40) => {
    const life = Math.max(0, 1 - age / TTL);
    return life > 0.45 ? 1 : 0.34 + (life / 0.45) * 0.66;
  };

  return (
    <div style={{ padding: '0 16px 40px', display: 'flex', flexDirection: 'column' }}>
      {/* S3 Room Header */}
      <header style={{ padding: '20px 0 14px' }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h1 className="t-lg" style={{ margin: 0 }}>
            {roomData?.title || '코쓱톤 네트워킹'}
          </h1>
          <div className="row" style={{ gap: '10px', alignItems: 'center' }}>
            <span className="t-sm dim">{headcount}</span>
            <button
              onClick={onOpenAdmin}
              className="badge"
              style={{ cursor: 'pointer', padding: '3px 8px' }}
              title="운영진 대시보드"
            >
              대시보드
            </button>
            <button
              onClick={onLeave}
              className="badge"
              style={{ cursor: 'pointer', padding: '3px 8px' }}
              title="나가기"
            >
              나가기
            </button>
          </div>
        </div>
      </header>

      {/* Composition Bar */}
      {compo.length > 0 && (
        <div className="compo">
          {compo.map((c) => (
            <i
              key={c.key}
              className={`bar-${c.key}`}
              style={{ width: `${c.pct}%` }}
              title={`${c.key}: ${c.pct}%`}
            />
          ))}
        </div>
      )}

      {/* Tally Strip */}
      <div className="stats" style={{ marginBottom: '14px' }}>
        {tally}
        <span className="faint" style={{ marginLeft: '8px' }}>방금 3명 들어옴</span>
      </div>

      {/* My Status Card (Click to Edit) */}
      <div style={{ marginTop: '4px' }}>
        <button
          className={`card mine s-${currentUser?.status || 'LOOKING_FOR'}`}
          onClick={onEditMine}
          title="클릭하여 내 상태 수정"
        >
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: '5px' }}>
            <span className="t-sm" style={{ color: 'var(--c)' }}>
              내 상태 · {STATUS_LABELS[currentUser?.status] || '이런 분 찾아요'}
            </span>
            <span className="t-sm faint">{myMinutesLeft}분 뒤 사라짐</span>
          </div>
          <div className="t-md wrap" style={{ color: 'var(--text)' }}>
            {currentUser?.note || '배포·CI 경험 있으신 분 찾아요'}
          </div>
        </button>
      </div>

      {/* Matching State & Group Header */}
      <div className="row" style={{ justifyContent: 'space-between', margin: '20px 0 9px' }}>
        <span className="t-sm dim">같은 공간</span>
        <span className="t-sm faint" style={{ color: 'var(--looking)', fontWeight: 500 }}>
          {matchState ? matchState : onRunMatch ? (
            <button
              onClick={onRunMatch}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--looking)' }}
            >
              <Sparkles size={13} /> AI 접점 찾기
            </button>
          ) : ''}
        </span>
      </div>

      {/* Empty State */}
      {otherMembers.length === 0 ? (
        <div className="empty">
          <p className="t-md" style={{ margin: '0 0 6px' }}>
            아직 이 방에 혼자 계세요
          </p>
          <p className="t-sm dim" style={{ margin: '0 0 20px', lineHeight: 1.6 }}>
            누가 들어오면 알려드릴게요.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* 닿는 거리 (Nearby) */}
          {nearMembers.length > 0 && (
            <>
              <p className="glabel" style={{ color: 'var(--text-dim)', fontWeight: 500 }}>
                닿는 거리 {nearMembers.length}
              </p>
              {nearMembers.map((p) => {
                const op = getFadeOpacity(p.age).toFixed(2);
                return (
                  <button
                    key={p.id}
                    className="person"
                    style={{ opacity: op }}
                    onClick={() => onSelectMemberForMatch(p)}
                  >
                    <div className="row" style={{ gap: '7px' }}>
                      <span className="t-lg grow trunc" style={{ fontWeight: 600 }}>
                        {p.name || p.nick}
                      </span>
                      <span className="badge" style={{ color: 'var(--sharing)', background: 'rgba(74, 222, 128, 0.1)' }}>
                        닿는 거리
                      </span>
                    </div>
                    <div className="t-sm faint" style={{ margin: '2px 0 6px' }}>
                      {p.school} · {STATUS_LABELS[p.st || p.status] || p.status}
                    </div>
                    <div className="t-md wrap" style={{ color: 'var(--text)' }}>
                      {p.note}
                    </div>
                  </button>
                );
              })}
            </>
          )}

          {/* 조금 떨어진 곳 (Further) */}
          {farMembers.length > 0 && (
            <>
              <p className="glabel" style={{ color: 'var(--text-faint)', marginTop: '16px' }}>
                조금 떨어진 곳 {farMembers.length}
              </p>
              {farMembers.map((p) => {
                const op = getFadeOpacity(p.age).toFixed(2);
                return (
                  <button
                    key={p.id}
                    className="person"
                    style={{ opacity: op }}
                    onClick={() => onSelectMemberForMatch(p)}
                  >
                    <div className="row" style={{ gap: '7px' }}>
                      <span className="t-lg grow trunc" style={{ fontWeight: 600 }}>
                        {p.name || p.nick}
                      </span>
                    </div>
                    <div className="t-sm faint" style={{ margin: '2px 0 6px' }}>
                      {p.school} · {STATUS_LABELS[p.st || p.status] || p.status}
                    </div>
                    <div className="t-md wrap" style={{ color: 'var(--text)' }}>
                      {p.note}
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
