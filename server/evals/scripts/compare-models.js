// Saved responses are always reused. Generation requires --live; interrupted
// in-flight requests require manual ledger reconciliation, never automatic retry.
import {readFileSync,writeFileSync,existsSync,renameSync,unlinkSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import ModuleProvider from '../providers/module.js';
import {assertAffordable,record} from '../lib/budget.js';
import {loadCase,listCases} from '../lib/fixtures.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const config=JSON.parse(readFileSync('scripts/comparison-config.json'));
const path='results/comparison-quality-2026-09-20.json';
const data=existsSync(path)?JSON.parse(readFileSync(path)):{config,results:[]};
if(JSON.stringify(data.config)!==JSON.stringify(config)) throw Error('Saved/current config mismatch');
const save=()=>{writeFileSync(path+'.tmp',JSON.stringify(data,null,2)+'\n');renameSync(path+'.tmp',path);};
const args=process.argv.slice(2), live=args.includes('--live');
const stage=args.find(a=>a.startsWith('--stage='))?.split('=')[1]??'smoke';
const discovery=JSON.parse(readFileSync('results/comparison-discovery-2026-09-20.json'));
if(discovery.prompt_digest!==config.prompt_digest || discovery.prompt_version!==config.prompt_version) throw Error('Frozen prompt mismatch');
if(live && process.env.EVAL_LIVE_CALL_CAP!=='240') throw Error('Set EVAL_LIVE_CALL_CAP=240');
if(!['smoke','full','diagnostic'].includes(stage)) throw Error('Unknown stage');
if(existsSync(path+'.inflight')) throw Error('Unreconciled inflight marker');
if(live){
 const check=spawnSync('uv',['run','--frozen','python','-c',"from app.ai.prompt import DefaultPromptProvider; p=DefaultPromptProvider(); assert p.version=='2026-09-20.2' and p.digest=='32db67109c375cf1'"],{cwd:resolve(root,'..')});
 if(check.status!==0) throw Error('Current prompt preflight failed');
}
const severe=new Set(['GATEWAY_HTTP_ERROR','GATEWAY_NETWORK_ERROR','INVALID_JSON','SCHEMA_MISMATCH','OUTPUT_TRUNCATED']);
for(const model of config.models){
 if(stage==='full'&&data.stopped?.[model]){console.log('saved stop',model,data.stopped[model]);continue;}
 if(!discovery.models?.[model]) {console.log(model,'unavailable');continue;}
 const previous=data.results.filter(r=>r.provider.label===model && ['E01','E02'].includes(r.vars.case_id));
 const persistent=previous.length===2 && previous.every(r=>{const o=JSON.parse(r.response.output??'{}');return o.recommendations?.every(x=>x.status==='FAILED' && severe.has(x.failure_code));});
 if(stage==='full' && persistent){console.log(model,'persistent smoke failure: full skipped');continue;}
 let ids=stage==='full'?listCases():['E01','E02'];
 if(stage==='diagnostic'){
  ids=previous.some(r=>r.response.output?.includes('TIMEOUT'))?['E01']:[];
 }
 let consecutiveSevere=0;
 for(const id of ids){
  const label=stage==='diagnostic'?model+':diagnostic':model;
  if(data.results.some(r=>r.provider.label===label&&r.vars.case_id===id)){console.log('saved',label,id);continue;}
  if(!live){console.log('missing (no generation)',label,id);continue;}
  const marker=path+'.inflight';
  if(existsSync(marker)) throw Error('Interrupted request: reconcile ledger and saved response before removing inflight marker');
  const reservation=Math.ceil(loadCase(id).request.candidates.length/5);
  assertAffordable(reservation,label);
  writeFileSync(marker,JSON.stringify({model,label,id,reservation,at:new Date().toISOString()}));
  const settings={...config.settings,...(stage==='diagnostic'?{request_timeout_seconds:60,total_timeout_seconds:90}:{})};
  const response=await new ModuleProvider({config:{mode:'live',model,settings},onResult:response=>{data.results.push({vars:{case_id:id},provider:{label},input_candidate_order:loadCase(id).request.candidates.map(c=>c.user_id),response});save();}}).callApi('',{vars:{case_id:id}});
  if(!response.output){
   record(`${id}@${label}:unknown-reservation`,reservation,{actual_calls:null,accounting:'conservative-upper-bound'});
   data.results.push({vars:{case_id:id},provider:{label},response:{error:'BRIDGE_FAILURE_CALLS_UNKNOWN'}});save();
   throw Error('Bridge failed: reservation recorded, marker retained; reconcile before continuing');
  }
  unlinkSync(marker);
  const o=JSON.parse(response.output);
  if(o.prompt_digest!==config.prompt_digest) throw Error('Response prompt digest mismatch');
  if(id!=='E08'){consecutiveSevere=o.recommendations.length && o.recommendations.every(r=>r.status==='FAILED'&&severe.has(r.failure_code))?consecutiveSevere+1:0;}
  console.log('saved',label,id,'calls',o.gateway_calls,'ms',o.duration_ms,'statuses',JSON.stringify(o.recommendations.reduce((a,r)=>(a[r.failure_code??r.status]=(a[r.failure_code??r.status]??0)+1,a),{})));
  if(consecutiveSevere>=2){data.stopped??={};data.stopped[model]='Two consecutive real cases entirely failed with HTTP/network/format codes';save();console.log('STOP',model,data.stopped[model]);break;}
 }
}
