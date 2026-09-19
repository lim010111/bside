// 집계 표시. prototype/index.html의 tally()/compo()(550~560줄)를 그대로 옮긴 것.
import { STATUSES, SHORT } from '../api/index.js';

/** "찾는 중 12 · 나눌 수 있음 15 · 처음 10 · 대화 가능 8" 같은 한 줄 */
export function tally(list) {
  const c = {};
  list.forEach((p) => { c[p.st] = (c[p.st] || 0) + 1; });
  return STATUSES.filter((s) => c[s.k]).map((s) => `${SHORT[s.k]} ${c[s.k]}`).join('  ·  ');
}

/** 방 구성 띠에 쓸 [{ k, pct }] 배열. 인원 비율만큼 폭을 준다 */
export function composition(list) {
  const c = {};
  list.forEach((p) => { c[p.st] = (c[p.st] || 0) + 1; });
  const n = list.length || 1;
  return STATUSES.filter((s) => c[s.k]).map((s) => ({ k: s.k, pct: (c[s.k] / n) * 100 }));
}
