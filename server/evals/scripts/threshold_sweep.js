/**
 * 저장된 평가 결과만으로 알림 임계값·조건을 훑는다. 새 생성 호출을 하지 않는다.
 *
 * app/ai/policy.py 의 판정 규칙을 그대로 옮겨, 같은 출력에 대해 하이퍼파라미터만 바꿨을 때
 * 오탐(알림 대상이 아니어야 하는데 적합)과 누락(적합해야 하는데 아님)이 어떻게 변하는지 본다.
 * 기준이 되는 기대값은 사례 파일의 notification_* 항목이며 사람 검토 전 가설이다(E01/E02의
 * 사용자 확인 범위는 우선순위이지 알림 대상이 아니다).
 */
import { readFileSync } from 'node:fs';
import { listCases, loadCase } from '../lib/fixtures.js';

const VIEWER = new Set(['VIEWER_SELF_DESCRIPTION', 'VIEWER_CONNECTION_INTENT']);
const CANDIDATE = new Set(['CANDIDATE_SELF_DESCRIPTION', 'CANDIDATE_CONNECTION_INTENT']);
const hasVerified = (excerpts, sources) => (excerpts ?? []).some((e) => e.verified && sources.has(e.source));

/** policy.py 의 evaluate() 와 같은 순서로 판정한다. */
function eligible(item, { threshold, mutual, intent }) {
  if (item.status !== 'EVALUATED') return false;
  if (item.intent_conflict) return false;
  if (item.score === null || item.score === undefined) return false;
  if (item.score < threshold) return false;
  if (!item.reason) return false;
  if (mutual && (!hasVerified(item.excerpts, VIEWER) || !hasVerified(item.excerpts, CANDIDATE))) return false;
  if (intent) {
    if (!hasVerified(item.excerpts, new Set(['VIEWER_CONNECTION_INTENT']))) return false;
    if (!hasVerified(item.excerpts, new Set(['CANDIDATE_CONNECTION_INTENT']))) return false;
  }
  return true;
}

function apply(result, options, cap) {
  let allowed = cap;
  const marked = new Map();
  for (const item of [...result.recommendations].sort((a, b) => a.rank - b.rank)) {
    const ok = eligible(item, options) && allowed > 0;
    if (ok) allowed -= 1;
    marked.set(item.candidate_user_id, ok);
  }
  return marked;
}

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!files.length) throw new Error('사용법: node scripts/threshold_sweep.js results/<파일>.json [...더 많은 파일]');
// replay.js 와 같은 규칙: 여러 파일을 합칠 때 뒤에 적은 파일이 이긴다.
const rows = [];
for (const path of files) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  for (const row of (parsed.results?.results ?? parsed.results).filter((r) => r.response?.output && r.vars?.case_id)) {
    const key = `${row.vars.case_id}|${row.provider?.label ?? row.provider?.id}`;
    const index = rows.findIndex((r) => `${r.vars.case_id}|${r.provider?.label ?? r.provider?.id}` === key);
    if (index >= 0) rows[index] = row;
    else rows.push(row);
  }
}

const providers = [...new Set(rows.map((r) => r.provider?.label ?? r.provider?.id))];
const CAP = 3;
const THRESHOLDS = [0.0, 0.3, 0.5, 0.6, 0.65, 0.72, 0.8, 0.85, 0.9, 1.0];
const MODES = [
  { name: '기본(상호+양쪽 의도 근거)', mutual: true, intent: true },
  { name: '상호 근거만', mutual: true, intent: false },
  { name: '점수만', mutual: false, intent: false },
];

console.log('저장된 출력만 사용. 새 생성 호출 없음.');
console.log(`알림 상한 max_per_request=${CAP}, 기준 기대값은 사례 파일의 notification_* (가설)\n`);

for (const mode of MODES) {
  console.log(`--- 조건: ${mode.name} ---`);
  console.log('임계값'.padEnd(8) + providers.map((p) => p.padEnd(26)).join(''));
  for (const threshold of THRESHOLDS) {
    let line = String(threshold.toFixed(2)).padEnd(8);
    for (const provider of providers) {
      let falsePositive = 0;
      let missed = 0;
      let marked = 0;
      for (const row of rows.filter((r) => (r.provider?.label ?? r.provider?.id) === provider)) {
        const caseId = row.vars?.case_id;
        if (!caseId) continue;
        const expectations = loadCase(caseId).expectations;
        const result = JSON.parse(row.response.output);
        const decided = apply(result, { threshold, mutual: mode.mutual, intent: mode.intent }, CAP);
        for (const [id, ok] of decided) if (ok) marked += 1;
        for (const id of expectations.notification_excluded_expected ?? []) if (decided.get(id)) falsePositive += 1;
        for (const id of expectations.notification_eligible_expected ?? []) if (!decided.get(id)) missed += 1;
      }
      line += `오탐${String(falsePositive).padStart(2)} 누락${String(missed).padStart(2)} 발송${String(marked).padStart(3)}`.padEnd(26);
    }
    console.log(line);
  }
  console.log('');
}
console.log('오탐 = 기대상 알림 대상이 아닌데 적합 처리됨 / 누락 = 기대상 대상인데 빠짐 / 발송 = 적합 표시된 총 건수');
console.log('모델이 바뀌면 같은 임계값이 같은 알림 품질을 뜻하지 않는다. 위 표는 조건별 비교용이다.');
