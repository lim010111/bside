// 접점 시트 — 편애하는 화면. prototype의 openSheet()/closeSheet()(741~798줄)를 옮긴 것.
// "여기만 손이 더 갔다"는 원칙을 그대로 지킨다: 근거 도표 + 강도 막대 + 첫마디 인용.
import { SL } from '../api/index.js';

export default function TouchpointSheet({ open, match, member, roomSize, myNote, onClose, onChat }) {
  return (
    <>
      <div className={`scrim${open ? ' on' : ''}`} onClick={onClose} />
      <div className={`sheet${open ? ' on' : ''}`} role="dialog" aria-modal="true" aria-label="접점">
        <div className="grip" />
        {!match ? (
          <div style={{ padding: '8px 2px 4px' }}>
            <h2 className="t-lg" style={{ margin: '0 0 8px' }}>아직 이어드릴 분이 없어요</h2>
            <p className="t-md dim" style={{ margin: 0, lineHeight: 1.65 }}>
              지금 {roomSize}명이 계시지만, 찾으시는{' '}
              <b style={{ color: 'var(--text)', fontWeight: 400 }}>{myNote}</b>을 올리신 분이 아직 없네요.
            </p>
            <p className="t-sm faint" style={{ margin: '14px 0 20px', lineHeight: 1.6 }}>
              누가 들어오면 알려드릴게요.
            </p>
            <button type="button" className="btn btn-ghost" onClick={onClose}>알겠어요</button>
          </div>
        ) : member && (
          <div style={{ padding: '2px 2px 4px' }} className={`s-${member.st}`}>
            <div className="row" style={{ gap: 7, marginBottom: 9 }}>
              <span className="chip">{SL[member.st]}</span>
              {member.near && <span className="badge">닿는 거리</span>}
            </div>
            <h2 className="t-xl" style={{ margin: '0 0 7px' }}>{member.name}님이 계세요</h2>
            <p className="t-md dim" style={{ margin: 0, lineHeight: 1.65 }}>
              찾고 계신 {match.leadSubject}, {member.name}님이 {match.leadDetail}.
            </p>

            <div className="why">
              <div className="t-sm faint" style={{ marginBottom: 9 }}>왜 이어드렸나</div>
              <div className="why-a">{match.reasonMine}</div>
              <svg className="link-draw" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
                <path d="M5 2 C 5.6 8, 4.3 13, 6.2 18 M6.2 18 L3.4 14.6 M6.2 18 L9.4 15.2" />
              </svg>
              <div className="why-b">{match.reasonTheirs}</div>
              <div className="meter">
                <span className="t-sm faint">겹치는 단어 {match.overlapWords}개</span>
                <span className="meter-bar"><i style={{ width: `${match.score * 100}%` }} /></span>
                <span className="t-sm dim">{match.score.toFixed(2)}</span>
              </div>
            </div>

            <div className="t-sm faint" style={{ marginBottom: 7 }}>이렇게 말 걸어보세요</div>
            <p className="quote" style={{ margin: 0 }}>{match.opener}</p>

            <div className="row" style={{ gap: 9, marginTop: 20 }}>
              <button type="button" className="btn" onClick={() => onChat(member)}>말 걸기</button>
              <button type="button" className="btn btn-ghost" onClick={onClose}>괜찮아요</button>
            </div>
            <p className="t-sm faint" style={{ textAlign: 'center', margin: '13px 0 0', lineHeight: 1.55 }}>
              {member.name}님께 전해지는 건 이름과 이 한 줄뿐입니다.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
