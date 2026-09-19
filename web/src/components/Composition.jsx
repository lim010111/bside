// 방 구성 띠. prototype의 compo()(554~560줄)를 컴포넌트로.
// 색이 나오는 몇 안 되는 자리 중 하나 — 목록을 읽기 전에 분위기가 먼저 잡힌다.
import { composition, tally } from '../lib/tally.js';

export function CompositionBar({ list }) {
  const bars = composition(list);
  if (!bars.length) return null;
  return (
    <div className="compo">
      {bars.map((b) => (
        <i key={b.k} className={`s-${b.k}`} style={{ width: `${b.pct}%` }} />
      ))}
    </div>
  );
}

/** 구성 띠 + 집계 문구를 함께. Entry의 pvStats, Room의 stats 둘 다 이 조합이다 */
export function Stats({ list, extra }) {
  if (!list.length) return null;
  return (
    <div className="stats">
      <CompositionBar list={list} />
      {tally(list)}
      {extra}
    </div>
  );
}
