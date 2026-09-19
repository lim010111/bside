// 내 상태 섹션. prototype의 mineWrap 렌더(664~671줄)를 옮기되, 구조를 사용자
// 레퍼런스에 맞춰 바꿨다: 카드 배경 대신 "내 상태 ── 수정" 라벨 행 + 실선 구분.
// 목록의 사람 카드(.person, 배경 있음)와 층위가 다르다는 걸 이렇게 드러낸다.
import { STATUSES } from '../api/index.js';
import { lifeOf, fadeOf, TTL } from '../lib/expiry.js';

export default function MyStatusCard({ me, t0, now, onEdit }) {
  const s = STATUSES.find((x) => x.k === me.st);
  const life = lifeOf(me, t0, 1, now);
  const left = Math.ceil((life * TTL) / 60);

  return (
    <div className={`section s-${me.st}`}>
      <div className="section-head">
        <span className="t-sm dim">내 상태</span>
        <button type="button" className="link" onClick={onEdit}>수정</button>
      </div>
      <div className="row" style={{ gap: 7, marginTop: 10 }}>
        <svg className="ic" style={{ color: 'var(--c)', width: 16, height: 16 }}>
          <use href={`#${s.icon}`} />
        </svg>
        <span className="t-sm" style={{ color: 'var(--c)' }}>{s.label}</span>
        <span className="t-sm faint" style={{ marginLeft: 'auto' }}>
          {life > 0 ? `${left}분 뒤 사라짐` : '사라짐'}
        </span>
      </div>
      <p className="t-body wrap" style={{ marginTop: 7, opacity: fadeOf(life).toFixed(2) }}>{me.note}</p>
    </div>
  );
}
