/**
 * 저장된 원본 출력에 교정된 단언을 다시 적용한다. **새 생성 호출을 하지 않는다.**
 *
 * 단언·집계 코드를 고쳤다고 해서 이미 돈을 낸 생성을 다시 부르지 않는다. 여기서 나오는
 * 수치는 모두 재생(replay)이며, 그 사실을 출력과 기록에 함께 남긴다.
 *
 * 사용: node scripts/replay.js results/live-full.json [--detail]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { loadCase, listCases } from '../lib/fixtures.js';
import { runAllChecks, runCrossCaseChecks, CHECKS } from '../lib/checks.js';

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!files.length) throw new Error('사용법: node scripts/replay.js results/<파일>.json [...더 많은 파일] [--detail]');
const detail = process.argv.includes('--detail');
// 여러 파일을 합칠 때는 **뒤에 적은 파일이 이긴다.** 기준선처럼 호출 없이 다시 만들 수 있는
// 출력을 고친 뒤, 유료 모델 출력은 그대로 두고 기준선만 갈아끼우기 위한 것이다.
const source = new Map();
const rows = [];
for (const path of files) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  for (const row of (parsed.results?.results ?? parsed.results).filter((r) => r.vars?.case_id)) {
    const key = `${row.vars.case_id}|${row.provider?.label ?? row.provider?.id}`;
    const index = rows.findIndex((r) => `${r.vars.case_id}|${r.provider?.label ?? r.provider?.id}` === key);
    if (index >= 0) rows[index] = row;
    else rows.push(row);
    source.set(key, path);
  }
}
const file = files[files.length - 1];
const providers = [...new Set(rows.map((r) => r.provider?.label ?? r.provider?.id))];
const cases = [...new Set(rows.map((r) => r.vars.case_id))].sort();

const pad = (s, n) => String(s).padEnd(n);
const W = 24;

// 사례×제공자별로 저장된 출력을 다시 채점한다.
const graded = new Map();
const outputs = new Map();
let newGenerationCalls = 0;
for (const row of rows) {
  const provider = row.provider?.label ?? row.provider?.id;
  const caseId = row.vars.case_id;
  const fixture = loadCase(caseId);
  if (!row.response?.output) {
    graded.set(`${caseId}|${provider}`, { pass: false, score: 0, reason: '저장된 출력 없음', componentResults: [] });
    continue;
  }
  const result = JSON.parse(row.response.output);
  outputs.set(`${caseId}|${provider}`, result);
  graded.set(`${caseId}|${provider}`, runAllChecks(result, fixture.request, fixture.expectations));
}

console.log(`재생 원본: ${files.join(' + ')}${files.length > 1 ? '  (뒤 파일 우선)' : ''}`);
console.log(`재생한 (사례×제공자) ${rows.length}건, 이번 재생에서 새로 발생시킨 생성 호출 ${newGenerationCalls}건\n`);

console.log('=== 사례별 (O=모든 해당 검사 통과) ===');
console.log(pad('사례', 6) + providers.map((p) => pad(p, W)).join(''));
for (const caseId of cases) {
  let line = pad(caseId, 6);
  for (const p of providers) {
    const g = graded.get(`${caseId}|${p}`);
    line += pad(g ? `${g.pass ? 'O' : 'X'} ${(g.score * 100).toFixed(0)}%` : '-', W);
  }
  console.log(line);
}

console.log('\n=== 검사 항목별 (통과/해당) — 해당 없는 검사는 분모에서 뺀다 ===');
const metrics = [...Object.keys(CHECKS), 'expectation_keys'];
console.log(pad('검사', 18) + providers.map((p) => pad(p, W)).join(''));
const totals = {};
for (const name of metrics) {
  let line = pad(name, 18);
  for (const p of providers) {
    let pass = 0;
    let applicable = 0;
    for (const caseId of cases) {
      const comp = graded.get(`${caseId}|${p}`)?.componentResults?.find((c) => c.assertion?.metric === name);
      if (!comp || comp.skipped) continue;
      applicable += 1;
      if (comp.pass) pass += 1;
      totals[p] ??= { pass: 0, applicable: 0 };
      totals[p].pass += comp.pass ? 1 : 0;
      totals[p].applicable += 1;
    }
    line += pad(applicable ? `${pass}/${applicable}` : '해당 없음', W);
  }
  console.log(line);
}
console.log(pad('합계', 18) + providers.map((p) => pad(totals[p] ? `${totals[p].pass}/${totals[p].applicable}` : '-', W)).join(''));

// --- 사용자가 확인한 핵심 우선순위만 따로 본다 -------------------------------
console.log('\n=== 사용자 확인 범위 (E01/E02 핵심 우선순위) — 가설 단언과 분리 ===');
for (const p of providers) {
  const lines = [];
  for (const caseId of ['E01', 'E02']) {
    const fixture = loadCase(caseId);
    const confirmed = fixture.expectations.human_confirmed;
    const result = outputs.get(`${caseId}|${p}`);
    if (!confirmed || !result) continue;
    const evaluated = result.recommendations
      .filter((r) => r.status === 'EVALUATED')
      .sort((a, b) => a.rank - b.rank)
      .map((r) => r.candidate_user_id);
    let verdict;
    if (confirmed.keys.includes('top1_any_of')) {
      const want = fixture.expectations.top1_any_of;
      verdict = `${want.includes(evaluated[0]) ? 'O' : 'X'} 1순위=${evaluated[0] ?? '없음'}`;
    } else {
      const { k, must_include_any_of: pool, min_included: min } = fixture.expectations.topk;
      const hit = evaluated.slice(0, k).filter((id) => pool.includes(id));
      verdict = `${hit.length >= (min ?? 1) ? 'O' : 'X'} 상위${k}=${evaluated.slice(0, k).join(',') || '없음'}`;
    }
    lines.push(`${caseId} ${verdict}`);
  }
  if (lines.length) console.log(`  ${pad(p, W)} ${lines.join('   ')}`);
}

// --- 교차 사례 (cross_case 를 실제로 소비한다) -------------------------------
console.log('\n=== 교차 사례: 같은 자기소개에서 의도만 바꿨을 때 (cross_case) ===');
const fixtures = Object.fromEntries(listCases().map((id) => [id, loadCase(id)]));
for (const p of providers) {
  const byCase = {};
  for (const caseId of cases) {
    const result = outputs.get(`${caseId}|${p}`);
    if (result) byCase[caseId] = result;
  }
  const outcomes = runCrossCaseChecks(byCase, fixtures);
  for (const o of outcomes) {
    console.log(`  ${pad(p, W)} ${o.other}→${o.caseId} ${o.pass ? 'O' : 'X'}  ${o.top_before ?? '-'} → ${o.top_after ?? '-'}  ${o.pass ? '' : '| ' + o.reason}`);
  }
}

if (detail) {
  console.log('\n=== 실패 상세 ===');
  for (const caseId of cases) {
    for (const p of providers) {
      const g = graded.get(`${caseId}|${p}`);
      if (!g || g.pass) continue;
      console.log(`\n[${caseId}] ${p}`);
      for (const c of (g.componentResults ?? []).filter((x) => !x.pass))
        console.log(`   (${c.assertion?.metric}) ${c.reason}`);
    }
  }
}

const out = files[files.length - 1].replace(/\.json$/, '.replay.json');
writeFileSync(out, JSON.stringify({
  replayed_from: files,
  row_source: Object.fromEntries(source),
  replayed_at: new Date().toISOString(),
  new_generation_calls: newGenerationCalls,
  note: '저장된 원본 출력에 교정된 단언을 다시 적용한 결과. 새 생성 호출 없음.',
  per_case: Object.fromEntries([...graded].map(([k, v]) => [k, { pass: v.pass, score: v.score, reason: v.reason }])),
}, null, 2) + '\n');
console.log(`\n기록: ${out} (재생 결과, 새 생성 호출 ${newGenerationCalls}건)`);
