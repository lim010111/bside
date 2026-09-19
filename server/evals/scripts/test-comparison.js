import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import ModuleProvider from '../providers/module.js';
const before=readFileSync(new URL('../results/live-budget.json',import.meta.url),'utf8');
let saved;
const provider=new ModuleProvider({config:{mode:'scripted'},onResult:r=>{saved=r;}});
const response=await provider.callApi('',{vars:{case_id:'E08'}});
assert.equal(response,saved);
assert.equal(JSON.parse(response.output).gateway_calls,2); // mock, never billed
const replay=spawnSync(process.execPath,['scripts/comparison-summary.js'],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
assert.equal(replay.status,0,replay.stderr);
const report=JSON.parse(readFileSync(new URL('../reports/model-comparison-2026-09-20.json',import.meta.url)));
for(const model of Object.values(report.models)){
 assert.equal(model.common7.applicable,60);
 assert.equal(model.real17.cases,17);
 assert.equal(model.mock.cases,1);
 assert.equal(model.cross_case.length,3);
 for(const c of model.cases.filter(c=>c.status==='missing_or_error')) {assert.equal(c.passed,0);assert(c.applicable>0);}
}
assert.equal(readFileSync(new URL('../results/live-budget.json',import.meta.url),'utf8'),before);
console.log('PASS offline persistence callback, fixed denominators, cross-case execution, zero ledger changes');
const {grade,summarizeBenchmark}=await import('./comparison-summary.js');
for(const id of ['E01','E02']){
 const missing=grade(undefined,id);
 assert.equal(missing.passed,0);
 assert.equal(missing.human.pass,false);
 assert.equal(missing.input_order_matches_current,null);
}
assert.equal(summarizeBenchmark([]).pure_cache,null);
assert.equal(summarizeBenchmark([]).cold_ms.median,null);
assert.equal(summarizeBenchmark([{phase:'cold',repeat:0,wall_ms:10},{phase:'cold',repeat:1,wall_ms:20}]).cold_ms.median,15);
const paired=[0,1,2].flatMap(repeat=>['cold','warm'].map(phase=>({repeat,phase,wall_ms:10,gateway_calls:phase==='cold'?4:0})));
assert.equal(summarizeBenchmark(paired).complete,true);
assert.equal(summarizeBenchmark(paired).pure_cache,true);
paired.at(-1).gateway_calls=1;
assert.equal(summarizeBenchmark(paired).pure_cache,false);
console.log('PASS missing human outcomes, unknown order provenance, benchmark completeness/median/cache');
