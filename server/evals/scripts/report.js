// 평가 결과 JSON 을 검사별 표로 정리한다. promptfoo 출력만 읽고 아무것도 호출하지 않는다.
import { readFileSync } from 'node:fs';
import { loadCase } from '../lib/fixtures.js';
import { CHECKS } from '../lib/checks.js';

const file = process.argv[2];
if (!file) throw new Error('사용법: node scripts/report.js results/<파일>.json [--detail]');
const detail = process.argv.includes('--detail');
const data = JSON.parse(readFileSync(file, 'utf8'));
const rows = data.results?.results ?? data.results ?? [];

const providers = [...new Set(rows.map((r) => r.provider?.label ?? r.provider?.id))];
const cases = [...new Set(rows.map((r) => r.vars?.case_id))].filter(Boolean).sort();
const names = Object.keys(CHECKS);

const cell = new Map();
for (const row of rows) {
  const key = `${row.vars?.case_id}|${row.provider?.label ?? row.provider?.id}`;
  cell.set(key, row);
}

const pad = (s, n) => String(s).padEnd(n);
const W = 22;

console.log('\n=== 사례별 통과 여부 (O=가설과 일치, X=불일치) ===');
console.log(pad('사례', 6) + providers.map((p) => pad(p, W)).join(''));
for (const id of cases) {
  let line = pad(id, 6);
  for (const p of providers) {
    const row = cell.get(`${id}|${p}`);
    const mark = row ? (row.success ? 'O' : 'X') : '-';
    const score = row?.score !== undefined ? ` ${(row.score * 100).toFixed(0)}%` : '';
    line += pad(`${mark}${score}`, W);
  }
  console.log(line);
}

console.log('\n=== 검사 항목별 통과 수 (전체 사례 기준) ===');
console.log(pad('검사', 18) + providers.map((p) => pad(p, W)).join(''));
const totals = {};
for (const name of names) {
  let line = pad(name, 18);
  for (const p of providers) {
    let pass = 0;
    let total = 0;
    for (const id of cases) {
      const row = cell.get(`${id}|${p}`);
      const comp = row?.gradingResult?.componentResults?.find((c) => c.assertion?.metric === name);
      if (!comp) continue;
      total += 1;
      if (comp.pass) pass += 1;
      totals[p] ??= { pass: 0, total: 0 };
      totals[p].pass += comp.pass ? 1 : 0;
      totals[p].total += 1;
    }
    line += pad(total ? `${pass}/${total}` : '-', W);
  }
  console.log(line);
}
console.log(pad('합계', 18) + providers.map((p) => pad(totals[p] ? `${totals[p].pass}/${totals[p].total}` : '-', W)).join(''));

console.log('\n=== 사례 전체 통과 (모든 검사 통과) ===');
for (const p of providers) {
  const passed = cases.filter((id) => cell.get(`${id}|${p}`)?.success);
  console.log(`  ${pad(p, W)} ${passed.length}/${cases.length}  ${passed.join(',')}`);
}

// 교차 사례: 같은 자기소개에서 의도만 바꿨을 때 1순위가 실제로 바뀌는가.
console.log('\n=== 교차 사례 검사 (의도만 바꿨을 때) ===');
const topOf = (row) => {
  if (!row?.response?.output) return null;
  const parsed = JSON.parse(row.response.output);
  const ev = parsed.recommendations.filter((r) => r.status === 'EVALUATED').sort((a, b) => a.rank - b.rank);
  return ev[0]?.candidate_user_id ?? null;
};
for (const [a, b] of [['E01', 'E02'], ['H01', 'H02']]) {
  if (!cases.includes(a) || !cases.includes(b)) continue;
  const expA = loadCase(a).expectations.top1_any_of ?? [];
  const expB = loadCase(b).expectations.top1_any_of ?? [];
  for (const p of providers) {
    const ta = topOf(cell.get(`${a}|${p}`));
    const tb = topOf(cell.get(`${b}|${p}`));
    const changed = ta && tb && ta !== tb;
    const right = expA.includes(ta) && expB.includes(tb);
    console.log(
      `  ${pad(p, W)} ${a}:${pad(ta ?? '-', 12)} ${b}:${pad(tb ?? '-', 12)} 변화=${changed ? 'O' : 'X'} 가설일치=${right ? 'O' : 'X'}`,
    );
  }
}

if (detail) {
  console.log('\n=== 실패 상세 ===');
  for (const id of cases) {
    for (const p of providers) {
      const row = cell.get(`${id}|${p}`);
      if (!row || row.success) continue;
      const failed = (row.gradingResult?.componentResults ?? []).filter((c) => !c.pass);
      console.log(`\n[${id}] ${p}`);
      for (const c of failed) console.log(`   (${c.assertion?.metric}) ${c.reason}`);
    }
  }
}

console.log('\n=== 메타데이터 (실행 재현용) ===');
const meta = new Map();
for (const row of rows) {
  const m = row.response?.metadata;
  if (!m) continue;
  const key = row.provider?.label ?? row.provider?.id;
  const prev = meta.get(key) ?? { calls: 0, ms: [], digests: new Set(), policies: new Set(), models: new Set() };
  prev.calls += m.gateway_calls ?? 0;
  if (m.duration_ms) prev.ms.push(m.duration_ms);
  if (m.prompt_digest) prev.digests.add(m.prompt_digest);
  if (m.policy_version) prev.policies.add(m.policy_version);
  if (m.model) prev.models.add(m.model);
  meta.set(key, prev);
}
for (const [p, m] of meta) {
  const sorted = [...m.ms].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)].toFixed(0) : '-';
  const max = sorted.length ? sorted[sorted.length - 1].toFixed(0) : '-';
  console.log(
    `  ${pad(p, W)} 배치호출=${m.calls} 중앙지연=${median}ms 최대=${max}ms 모델=${[...m.models].join(',') || '-'} 프롬프트digest=${[...m.digests].join(',') || '-'} 정책=${[...m.policies].join(',') || '-'}`,
  );
}
