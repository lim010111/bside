import React from 'react';

const STATUS_LABELS = {
  LOOKING_FOR: '이런 분 찾아요',
  CAN_SHARE: '이런 얘기 할 수 있어요',
  FIRST_TIME: '처음 왔어요',
  OPEN: '대화 가능',
};

export default function MatchModal({
  match,
  partner,
  currentUser,
  onStartChat,
  onClose,
  totalCount = 46,
}) {
  if (!match && !partner) return null;

  const isNone = match?.isNone || (!match && !partner);
  const p = partner || (match?.helper_nick ? {
    id: match.helper_id || 'minseo',
    name: match.helper_nick,
    school: match.helper_school || '순천향대',
    st: 'CAN_SHARE',
    near: match.helper_near ?? true,
    note: match.why_b || '작년에 도커로 CI 파이프라인 구축해봤어요',
  } : null);

  return (
    <>
      {/* Scrim Backdrop */}
      <div className="scrim on" onClick={onClose} />

      {/* S4 Bottom Sheet */}
      <div className="sheet on" role="dialog" aria-modal="true" aria-label="접점">
        <div className="grip" />

        {isNone || !p ? (
          <div style={{ padding: '8px 2px 4px' }}>
            <h2 className="t-lg" style={{ margin: '0 0 8px' }}>
              아직 이어드릴 분이 없어요
            </h2>
            <p className="t-md dim" style={{ margin: 0, lineHeight: 1.65 }}>
              지금 {totalCount}명이 계시지만, 찾으시는{' '}
              <b style={{ color: 'var(--text)', fontWeight: 400 }}>
                {currentUser?.note ? currentUser.note.slice(0, 20) : '배포·CI 경험'}
              </b>
              을 올리신 분이 아직 없네요.
            </p>
            <p className="t-sm faint" style={{ margin: '14px 0 20px', lineHeight: 1.6 }}>
              누가 들어오면 알려드릴게요.
            </p>
            <button className="btn btn-ghost" onClick={onClose}>
              알겠어요
            </button>
          </div>
        ) : (
          <div style={{ padding: '2px 2px 4px' }}>
            {/* Chips */}
            <div className="row" style={{ gap: '7px', marginBottom: '9px' }}>
              <span className={`chip s-${p.st || 'CAN_SHARE'}`}>
                {STATUS_LABELS[p.st || 'CAN_SHARE']}
              </span>
              {p.near && (
                <span className="badge" style={{ color: 'var(--sharing)', background: 'rgba(74, 222, 128, 0.1)' }}>
                  닿는 거리
                </span>
              )}
            </div>

            {/* Title */}
            <h2 className="t-xl" style={{ margin: '0 0 7px' }}>
              {p.name || p.nick}님이 계세요
            </h2>
            <p className="t-md dim" style={{ margin: 0, lineHeight: 1.65 }}>
              찾고 계신 배포·CI 경험, {p.name || p.nick}님이 작년에 구축해보셨어요.
            </p>

            {/* Why Diagram */}
            <div className="why">
              <div className="t-sm faint" style={{ marginBottom: '9px' }}>
                왜 이어드렸나
              </div>
              <div className="why-a">
                {match?.why_a || '배포·CI 경험을 찾는 중'}
              </div>
              <svg className="link-draw" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
                <path d="M5 2 C 5.6 8, 4.3 13, 6.2 18 M6.2 18 L3.4 14.6 M6.2 18 L9.4 15.2" />
              </svg>
              <div className="why-b">
                {match?.why_b || '작년에 CI 파이프라인 구축'}
              </div>
              <div className="meter">
                <span className="t-sm faint">겹치는 단어 0개</span>
                <span className="meter-bar">
                  <i style={{ width: `${Math.round((match?.strength || 0.85) * 100)}%` }} />
                </span>
                <span className="t-sm dim">{(match?.strength || 0.85).toFixed(2)}</span>
              </div>
            </div>

            {/* Conversation Starter */}
            <div className="t-sm faint" style={{ marginBottom: '7px' }}>
              이렇게 말 걸어보세요
            </div>
            <p className="quote" style={{ margin: 0 }}>
              {match?.opener || '혹시 CI 구축해보셨다고 들었어요. 저 지금 배포 권한에서 막혀 있는데요.'}
            </p>

            {/* Buttons */}
            <div className="row" style={{ gap: '9px', marginTop: '20px' }}>
              <button
                className="btn"
                onClick={() => {
                  onStartChat(p);
                }}
              >
                말 걸기
              </button>
              <button className="btn btn-ghost" onClick={onClose}>
                괜찮아요
              </button>
            </div>

            <p className="t-sm faint" style={{ textAlign: 'center', margin: '13px 0 0', lineHeight: 1.55 }}>
              {p.name || p.nick}님께 전해지는 건 이름과 이 한 줄뿐입니다.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
