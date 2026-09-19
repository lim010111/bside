import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadCase,listCases} from '../lib/fixtures.js';
import {runAllChecks,runCrossCaseChecks} from '../lib/checks.js';
process.chdir(resolve(dirname(fileURLToPath(import.meta.url)),'..'));
const read=p=>JSON.parse(readFileSync(p));
const config=read('scripts/comparison-config.json');
const metadataProcess=spawnSync('uv',['run','--frozen','python','evals/scripts/comparison-metadata.py'],{cwd:'..',encoding:'utf8'});
assert.equal(metadataProcess.status,0,'Expected metadata preflight failed');
const expectedMetadata=JSON.parse(metadataProcess.stdout);
const common=['E01','E02','E03','E05','N01','N02','N03'];
const fixtures=Object.fromEntries(listCases().map(id=>[id,loadCase(id)]));
const rowsOf=d=>d.results?.results??d.results;
export function grade(row,id){
 const f=fixtures[id];let output;
 try{output=JSON.parse(row?.response?.output);}catch{}
 // A structurally valid empty result determines applicability from frozen expectations.
 // Missing responses fail every applicable check, never vanish from the denominator.
 const missing=!output;
 const g=runAllChecks(output??{recommendations:[],viewer_profile_revision:f.request.viewer.profile_revision},f.request,f.expectations);
 const checks=g.componentResults.map(c=>({metric:c.assertion.metric,skipped:!!c.skipped,pass:missing?false:c.pass}));
 const applicable=checks.filter(c=>!c.skipped);
 const ranked=output?.recommendations.filter(r=>r.status==='EVALUATED').sort((a,b)=>a.rank-b.rank).map(r=>r.candidate_user_id)??[];
 let human=null;
 if(id==='E01')human={pass:f.expectations.top1_any_of.includes(ranked[0]),top:ranked.slice(0,1)};
 if(id==='E02'){const t=f.expectations.topk;human={pass:ranked.slice(0,t.k).filter(x=>t.must_include_any_of.includes(x)).length>=(t.min_included??1),top:ranked.slice(0,t.k)};}
 const counts=key=>(output?.recommendations??[]).reduce((a,r)=>{if(r[key])a[r[key]]=(a[r[key]]??0)+1;return a;},{});
 return {case_id:id,status:missing?'missing_or_error':counts('status').FAILED?'request_failure':'recorded',passed:applicable.filter(c=>c.pass).length,applicable:applicable.length,checks,human,statuses:counts('status'),failure_codes:counts('failure_code'),duration_ms:output?.duration_ms??null,settings:row?.response?.metadata?.settings_overrides??null,gateway_calls:output?.gateway_calls??null,usage:output?.usage??null,prompt_digest:output?.prompt_digest??null,inference_digest:output?.inference_digest??null,input_candidate_order:row?.input_candidate_order??null,input_order_provenance:row?.input_candidate_order?'saved_actual':'unavailable; current loader order is inferred only',inferred_candidate_order:row?.input_candidate_order?null:f.request.candidates.map(c=>c.user_id),input_order_matches_current:row?.input_candidate_order?JSON.stringify(row.input_candidate_order)===JSON.stringify(f.request.candidates.map(c=>c.user_id)):null};
}
const total=cases=>({candidate_statuses:cases.reduce((a,c)=>{for(const [k,v]of Object.entries(c.statuses))a[k]=(a[k]??0)+v;return a;},{}),candidate_failure_codes:cases.reduce((a,c)=>{for(const [k,v]of Object.entries(c.failure_codes))a[k]=(a[k]??0)+v;return a;},{}),passed:cases.reduce((n,c)=>n+c.passed,0),applicable:cases.reduce((n,c)=>n+c.applicable,0),cases:cases.length,missing:cases.filter(c=>c.status==='missing_or_error').length,request_failure_cases:cases.filter(c=>c.status==='request_failure').length});
const raw='results/comparison-quality-2026-09-20.json';
const rawData=read(raw);
assert.deepEqual(rawData.config,config,'Raw config mismatch');
const rows=rowsOf(rawData);
for(const row of rows){
 if(!row.response?.output)continue;
 const o=JSON.parse(row.response.output);
 const diagnostic=row.provider.label.endsWith(':diagnostic');
 const model=row.vars.case_id==='E08'?'fault-injection':row.provider.label.replace(':diagnostic','');
 assert.equal(o.prompt_digest,config.prompt_digest,'Response prompt mismatch');
 assert.equal(o.inference_digest,expectedMetadata[model][diagnostic?'diagnostic':'basic'].inference_digest,'Response inference mismatch');
 assert.deepEqual(row.response.metadata.settings_overrides,{...config.settings,...(diagnostic?{request_timeout_seconds:60,total_timeout_seconds:90}:{})},'Response settings mismatch');
 if(row.input_candidate_order)assert.deepEqual(row.input_candidate_order,fixtures[row.vars.case_id].request.candidates.map(c=>c.user_id),'Saved order mismatch');
}
const report={date:'2026-09-20',config,expected_metadata:expectedMetadata,discovery:read('results/comparison-discovery-2026-09-20.json'),artifacts:[raw],models:{},prior:{},limitations:['H/N are previously observed cases, not fresh holdouts','Provider pricing unknown; cap240 is operational, not a monetary budget','Deadline failures remain in the basic score; diagnostic results excluded','Cross-case checks reported separately from common7 check totals'],ledger:{start:117,cumulative:read('results/live-budget.json').generation_requests},commands:['EVAL_LIVE_CALL_CAP=240 node scripts/compare-models.js --live --stage=smoke','EVAL_LIVE_CALL_CAP=240 node scripts/compare-models.js --live --stage=diagnostic','EVAL_LIVE_CALL_CAP=240 node scripts/compare-models.js --live --stage=full','EVAL_LIVE_CALL_CAP=240 uv run --frozen python evals/scripts/comparison-bench.py --live','node scripts/comparison-summary.js','node scripts/replay.js results/comparison-quality-2026-09-20.json']};
report.ledger.new_calls=report.ledger.cumulative-117;
for(const model of config.models){
 const own=rows.filter(r=>r.provider.label===model);
 const cases=listCases().map(id=>grade(own.find(r=>r.vars.case_id===id),id));
 const outputs=Object.fromEntries(own.filter(r=>r.response.output).map(r=>[r.vars.case_id,JSON.parse(r.response.output)]));
 report.models[model]={stop_reason:rawData.stopped?.[model]??null,cases,common7:total(cases.filter(c=>common.includes(c.case_id))),real17:total(cases.filter(c=>c.case_id!=='E08')),mock:total(cases.filter(c=>c.case_id==='E08')),all18:total(cases),cross_case:runCrossCaseChecks(outputs,fixtures),diagnostic:rows.filter(r=>r.provider.label===model+':diagnostic').map(r=>grade(r,r.vars.case_id))};
}
const priorRows={};
for(const file of ['results/live-targeted-prompt2.json','results/live-targeted-fresh.json']){
 report.artifacts.push(file);
 for(const row of rowsOf(read(file))){
  const label=row.provider.label??row.provider.id;
  if(common.includes(row.vars?.case_id))priorRows[`${label}:${row.vars.case_id}`]=row;
 }
}
for(const label of ['baseline:lexical','module:claude-haiku-4-5','module:deepseek-v3.2']){
 const cases=common.map(id=>{
  const row=priorRows[`${label}:${id}`];
  if(row?.response?.output && label!=='baseline:lexical'){
   const o=JSON.parse(row.response.output);
   assert.equal(o.prompt_digest,config.prompt_digest,'Prior prompt mismatch');
   assert.equal(o.inference_digest,expectedMetadata[label.replace('module:','')].basic.inference_digest,'Prior inference mismatch');
  }
  return grade(row,id);
 });
 report.prior[label]={cases,common7:total(cases)};
}

export function summarizeBenchmark(runs){
 const cold=runs.filter(r=>r.phase==='cold').map(r=>r.wall_ms).sort((a,b)=>a-b);
 const warm=runs.filter(r=>r.phase==='warm');
 const complete=runs.length===6 && [0,1,2].every(i=>['cold','warm'].every(p=>runs.filter(r=>r.repeat===i&&r.phase===p).length===1));
 const median=cold.length?(cold[Math.floor((cold.length-1)/2)]+cold[Math.floor(cold.length/2)])/2:null;
 return {runs,complete,cold_count:cold.length,warm_count:warm.length,cold_ms:{median,min:cold[0]??null,max:cold.at(-1)??null},pure_cache:complete?warm.every(r=>r.gateway_calls===0):null};
}

const bench='results/comparison-bench-2026-09-20.json';
if(existsSync(bench)){
 assert.deepEqual(read(bench).config,config,'Bench config mismatch');
 report.artifacts.push(bench);
 for(const [model,reason] of Object.entries(read(bench).skipped??{})) report.models[model].benchmark={skipped:reason};
 for(const [model,runs]of Object.entries(read(bench).models)){
  for(const run of runs){assert.equal(run.prompt_digest,config.prompt_digest);assert.equal(run.inference_digest,expectedMetadata[model].basic.inference_digest);}
  report.models[model].benchmark={...summarizeBenchmark(runs),input_candidate_order:read(bench).input_candidate_order??null,stop_reason:read(bench).skipped?.[model]??null};

 }
}
if(existsSync('results/comparison-offline-validation-2026-09-20.json')) report.offline_validation=read('results/comparison-offline-validation-2026-09-20.json');
mkdirSync('reports',{recursive:true});writeFileSync('reports/model-comparison-2026-09-20.json',JSON.stringify(report)+'\n');
console.log(JSON.stringify({models:Object.fromEntries(Object.entries(report.models).map(([m,v])=>[m,{common7:v.common7,real17:v.real17,human:v.cases.filter(c=>c.human).map(c=>[c.case_id,c.human]),cross_case:v.cross_case}])),prior:Object.fromEntries(Object.entries(report.prior).map(([m,v])=>[m,v.common7])),ledger:report.ledger},null,2));
