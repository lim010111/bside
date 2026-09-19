// 목록 카드 하나. prototype의 pcard()(692~709줄)를 컴포넌트로.
// React는 텍스트를 자동 이스케이프하므로 prototype의 esc()는 필요 없다.
import { lifeOf, fadeOf } from '../lib/expiry.js';
import { SHORT } from '../api/index.js';

// 클릭했을 때 뭘 보여줄지가 없다 — 접점 시트는 AI가 찾아준 그 한 사람 전용이고
// (spec/PRD.md "AI가 상보 관계 발견 → 카드"), 목록의 다른 카드를 눌러서 같은
// 근거·첫마디를 또 보여주면 그 사람과는 무관한 내용이 뜨는 오류가 된다.
// prototype은 데모 편의로 아무 카드나 눌러도 열리게 해뒀지만(pcard 692~703줄의
// onclick="openSheet('${p.id}')"), 그건 항상 같은 고정 텍스트를 보여주는 데모
// 단축키였지 실제 동작이 아니었다. 여기서는 정보 카드로만 두고, onOpen을 넘기면
// (나중에 "이 사람과 접점 보기" 같은 기능이 생기면) 버튼으로 승격할 수 있게 남겨둔다.
export default function PersonCard({ person, t0, now, onOpen }) {
  const life = lifeOf(person, t0, 1, now);
  const Tag = onOpen ? 'button' : 'div';
  return (
    <Tag
      type={onOpen ? 'button' : undefined}
      className={`person s-${person.st}${person.near ? ' near' : ''} fade`}
      style={{ opacity: fadeOf(life).toFixed(2) }}
      onClick={onOpen ? () => onOpen(person.id) : undefined}
    >
      <div className="row" style={{ gap: 8 }}>
        <span className="t-lg grow trunc">{person.name}</span>
        <span className="t-sm" style={{ color: 'var(--c)' }}>{SHORT[person.st]}</span>
      </div>
      <div className="t-sm faint" style={{ margin: '1px 0 8px' }}>{person.school}</div>
      <div className="t-body wrap">{person.note}</div>
      <i className="life" style={{ width: `${(life * 100).toFixed(1)}%` }} />
    </Tag>
  );
}

/** 그룹 라벨 + 카드 목록. prototype의 grp()(705~709줄) */
export function PersonGroup({ label, list, t0, now, onOpen }) {
  if (!list.length) return null;
  return (
    <>
      <p className="glabel">{label} {list.length}</p>
      {list.map((p) => (
        <PersonCard key={p.id} person={p} t0={t0} now={now} onOpen={onOpen} />
      ))}
    </>
  );
}
