import assert from 'node:assert/strict';
import { randomBytes,randomUUID,createHash } from 'node:crypto';
import { existsSync,lstatSync,realpathSync,mkdirSync,readFileSync,openSync,writeSync,closeSync,fstatSync } from 'node:fs';
import { resolve,relative,isAbsolute,join,dirname,sep } from 'node:path';
import { hostname } from 'node:os';
import { execFileSync,fork,type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import type pg from 'pg';
import { writeJson } from '../storage.js';
import { pool } from './db.js';
import { migrate } from './migrate.js';
import { seed } from './setup.js';
import { Latencies,OperationsMetrics,instrument } from './operations-metrics.js';
import { holdLock } from '../ownership.js';

export const operationLimits=Object.freeze({sellers:2,cycles:120,cadenceMs:30000,durationMs:3600000,planned:240,baselineMs:60000,settledMs:300000,databaseGrowthBytes:512*1024**2,evidenceBytes:256*1024**2});
export function stableRun(seed:string,seller:string,cycle:number){
 if(!Number.isInteger(cycle)||cycle<0||cycle>=1000)throw Error('invalid-operation-cycle');
 const h=createHash('sha256').update(JSON.stringify([seed,seller,cycle])).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
}
export function ownedDirectory(path:string){
 const location=relative(resolve('..'),path);
 if(!isAbsolute(path)||realpathSync(path)!==path||!(location==='..'||location.startsWith('..'+sep)))throw Error('explicit-private-directory-outside-workspace-required');
 const s=lstatSync(path);if(!s.isDirectory()||s.uid!==process.getuid!()||(s.mode&0o077)!==0)throw Error('owned-private-directory-required');return path;
}
function privateFile(path:string){const s=lstatSync(path);if(!s.isFile()||s.isSymbolicLink()||s.uid!==process.getuid!()||(s.mode&0o077)!==0||s.size>16384)throw Error('private-owned-record-required');return JSON.parse(readFileSync(path,'utf8'));}
export function dataset(root:string){
 ownedDirectory(root);const record=privateFile(join(root,'operations.json')),database=privateFile(join(root,'database.json'));
 if(record.purpose!=='disposable-seller-operations-v1'||record.root!==root||record.host!==hostname()||database.root!==root||database.socket!==join(root,'socket')||!['docker','podman'].includes(database.runtime)||!/^pasarpilot-scheduler-db-[a-f0-9]{12}$/.test(database.container))throw Error('owned-disposable-dataset-required');
 ownedDirectory(database.socket);return {record,database};
}
export function evidence(root:string,output:string){
 dataset(root);if(dirname(output)!==join(root,'evidence')||existsSync(output))throw Error('new-explicit-evidence-directory-required');
 if(!existsSync(dirname(output)))mkdirSync(dirname(output),{mode:0o700});ownedDirectory(dirname(output));mkdirSync(output,{mode:0o700});
 return new Evidence(output);
}
export class Evidence{
 private fd:number;private bytes=0;readonly counts={planned:0,attempted:0,passed:0,failed:0,notAttempted:0};
 failure?:string;
 readonly reads=new Latencies();readonly mutations=new Latencies();
 readonly visibility=new Latencies();
 constructor(readonly output:string){ownedDirectory(output);this.fd=openSync(join(output,'events.jsonl'),'wx',0o600);}
 write(value:Record<string,unknown>){if(value.type==='request'&&typeof value.ms==='number')(value.method==='GET'?this.reads:this.mutations).add(value.ms);if(value.type==='visibility'&&typeof value.ms==='number')this.visibility.add(value.ms);const line=JSON.stringify({time:new Date().toISOString(),...value})+'\n';try{if(this.bytes+Buffer.byteLength(line)>operationLimits.evidenceBytes)throw Error('evidence-limit');if(writeSync(this.fd,line)!==Buffer.byteLength(line))throw Error('partial-evidence-write');this.bytes=fstatSync(this.fd).size;}catch(error){this.failure??='evidence-write-failed';throw error;}}
 outcome(value:{seller:string;cycle:number;started:boolean;ok:boolean;reason?:string}){this.counts.planned++;if(value.started)this.counts.attempted++;else this.counts.notAttempted++;if(value.ok)this.counts.passed++;else this.counts.failed++;this.write({type:'outcome',...value});}
 close(){closeSync(this.fd);}
}
export async function prepareOperations(root:string,runtime:string){
 if(!isAbsolute(root)||existsSync(root)||!['podman','docker'].includes(runtime))throw Error('new-explicit-operations-root-required');
 ownedDirectory(dirname(root));mkdirSync(root,{mode:0o700});ownedDirectory(root);
 writeJson(join(root,'operations.json'),{purpose:'disposable-seller-operations-v1',root,host:hostname(),id:randomUUID(),createdAt:new Date().toISOString(),revision:process.env.BENCH_REVISION??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),limits:operationLimits,sourceDirty:process.env.BENCH_REVISION?false:!!execFileSync('git',['status','--porcelain','--','src','test','package.json','package-lock.json'],{encoding:'utf8'}).trim(),sourceArchiveSha256:process.env.BENCH_ARCHIVE_SHA256??null});
 execFileSync('sh',['prepare-scheduler-db.sh',root,runtime],{stdio:['ignore','ignore','pipe'],timeout:120000});
 process.env.PGHOST=join(root,'socket');const p=pool('fixture');
 try{await migrate(p);const passwords=[randomBytes(24).toString('hex'),randomBytes(24).toString('hex')],ids=await seed(p,passwords);writeJson(join(root,'accounts.json'),ids.map((seller,i)=>({seller,login:['seller-a','seller-b'][i],password:passwords[i]})));}finally{await p.end();}
 dataset(root);return {root,prepared:true};
}
export type Account={seller:string;login:string;password:string};
export function accountsFor(root:string):Account[]{dataset(root);const accounts=privateFile(join(root,'accounts.json'));if(!Array.isArray(accounts)||accounts.length!==2||new Set(accounts.map(a=>a.login)).size!==2||new Set(accounts.map(a=>a.seller)).size!==2||accounts.some(a=>!['seller-a','seller-b'].includes(a.login)||typeof a.password!=='string'||a.password.length<12||a.password.length>256||typeof a.seller!=='string'))throw Error('invalid-protected-accounts');return accounts;}
export async function httpClient(base:string,account:Account,report:Evidence,guard:()=>string|undefined){
 if(new URL(base).hostname!=='127.0.0.1')throw Error('loopback-only-operations');
 let cookie='',csrf='';
 const request=async(path:string,data?:Record<string,string>,login=false)=>{
  if(guard())throw Error('admission-stopped');const start=performance.now();let status=0,bytes=0;
  try{
   const response=await fetch(base+path,{method:data?'POST':'GET',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{cookie,...(data?{origin:base,'content-type':'application/x-www-form-urlencoded'}:{})},...(data?{body:new URLSearchParams({csrf,...data})}:{})});status=response.status;
   if(login){cookie=response.headers.get('set-cookie')?.split(';')[0]??'';if(!cookie)throw Error('session-cookie-missing');}
   let html=await response.text();bytes+=Buffer.byteLength(html);
   if(data){if(status!==303)throw Error('http-mutation-rejected');const next=new URL(response.headers.get('location')??'',base);if(next.origin!==base||next.pathname!=='/')throw Error('unsafe-redirect');const page=await fetch(next,{headers:{cookie},redirect:'manual',signal:AbortSignal.timeout(10000)});status=page.status;html=await page.text();bytes+=Buffer.byteLength(html);}
   if(status!==200)throw Error('http-read-rejected');return html;
  }finally{report.write({type:'request',seller:account.seller,method:data?'POST':'GET',path,status,ms:performance.now()-start,bytes});}
 };
 const entryStart=performance.now(),entry=await fetch(base+'/login',{redirect:'manual',signal:AbortSignal.timeout(10000)}),html=await entry.text();report.write({type:'request',seller:account.seller,method:'GET',path:'/login',status:entry.status,ms:performance.now()-entryStart,bytes:Buffer.byteLength(html)});cookie=entry.headers.get('set-cookie')?.split(';')[0]??'';csrf=html.match(/name="csrf" value="([^"]+)"/)?.[1]??'';assert.ok(cookie&&csrf);
 const signed=await request('/login',{login:account.login,password:account.password},true);csrf=signed.match(/name="csrf" value="([^"]+)"/)?.[1]??'';assert.ok(csrf);
 return {get:(path:string)=>request(path),post:(path:string,data:Record<string,string>)=>request(path,data),cookie:()=>cookie};
}
export async function sale(p:pg.Pool,client:Awaited<ReturnType<typeof httpClient>>,seller:string,run:string,report:Evidence){
 await client.post('/demo-start',{run});const accepted=performance.now();await client.post('/demo-step',{run,step:'claim-a'});await client.post('/demo-step',{run,step:'backup-b'});
 const item='demo-item:'+run,o=(await p.query("SELECT id FROM trading.orders WHERE seller_id=$1 AND item_id=$2 AND buyer='buyer-a'",[seller,item])).rows[0];assert.ok(o);
 report.write({type:'visibility',seller,run,ms:performance.now()-accepted});const back='/?view=orders&id='+encodeURIComponent(o.id);
 await client.post('/terms',{id:o.id,version:'1',method:'collection',fee:'0.00',return:back});await client.post('/payment-draft',{id:o.id,version:'2',return:back});
 const draft=(await p.query("SELECT id FROM trading.drafts WHERE seller_id=$1 AND order_id=$2 AND kind='payment' ORDER BY id LIMIT 1",[seller,o.id])).rows[0];assert.ok(draft);
 await client.post('/approve',{id:draft.id,version:'1',return:back});await client.get(back+'&confirm=payment');await client.post('/confirm-payment',{id:o.id,version:'2',amount:'10.00',trusted:'yes',return:back});
 await client.post('/arrange',{id:o.id,version:'3',location:'Synthetic game shop',time:new Date().toISOString(),return:back});await client.post('/fulfil',{id:o.id,version:'4',status:'collected',evidence:'Synthetic seller handover',return:back});await client.get(back+'&confirm=complete');await client.post('/complete',{id:o.id,version:'5',confirmed:'yes',return:back});
 const result=(await p.query("SELECT o.state,o.payment,v.unsold,v.reserved,(SELECT count(*)::int FROM trading.activity WHERE seller_id=o.seller_id AND record_id=o.id AND action='payment_verified_and_stock_committed') commits,(SELECT state FROM trading.claims WHERE seller_id=o.seller_id AND item_id=o.item_id AND buyer='buyer-b' LIMIT 1) backup FROM trading.orders o JOIN trading.items i ON(i.seller_id=o.seller_id AND i.id=o.item_id) JOIN trading.inventory v ON(v.seller_id=i.seller_id AND v.id=i.inventory_id) WHERE o.seller_id=$1 AND o.id=$2",[seller,o.id])).rows[0];
 assert.equal(result.state,'completed');assert.equal(result.payment,'seller_verified');assert.equal(result.unsold,0);assert.equal(result.reserved,0);assert.equal(result.commits,1);assert.equal(result.backup,'unfulfilled');
 await client.get('/?view=orders&state=completed');await client.get(back+'&child=activity');await client.get('/?view=inventory&q=RM10');await client.get('/updates');return o.id as string;
}
export async function workload(root:string,base:string,p:pg.Pool,stage:'smoke'|'clean',report:Evidence,guard:()=>string|undefined){
 const {record}=dataset(root),accounts=accountsFor(root),cycles=stage==='clean'?operationLimits.cycles:1,start=Date.now();
 report.write({type:'plan',stage,start,planned:cycles*2,cyclesPerSeller:cycles,concurrencyCeiling:2,cadenceMs:stage==='clean'?operationLimits.cadenceMs:0,limits:operationLimits,revision:record.revision});
 const clients:Awaited<ReturnType<typeof httpClient>>[]=[];for(const account of accounts){const client=await httpClient(base,account,report,guard),seller=(await p.query('SELECT profile_version,instruction_version FROM trading.sellers WHERE id=$1',[account.seller])).rows[0];await client.post('/profile',{version:String(seller.profile_version),display_name:'Synthetic operations '+account.login,return:'/?view=settings'});await client.post('/instructions',{version:String(seller.instruction_version),instructions:'DEMO ONLY synthetic account',approved:'yes',return:'/?view=settings'});clients.push(client);}
 await Promise.all(accounts.map(async(account,index)=>{
  for(let cycle=0;cycle<cycles;cycle++){
   const due=start+(stage==='clean'?cycle*operationLimits.cadenceMs:0);
   if(!guard()&&due>Date.now())await delay(due-Date.now());
   const stopped=guard();if(stopped){report.outcome({seller:account.seller,cycle,started:false,ok:false,reason:stopped});continue;}
   if(stage==='clean'&&Date.now()-due>=operationLimits.cadenceMs){report.outcome({seller:account.seller,cycle,started:false,ok:false,reason:'missed-cadence'});continue;}
   try{await sale(p,clients[index]!,account.seller,stableRun(record.id+':'+stage,account.seller,cycle),report);report.outcome({seller:account.seller,cycle,started:true,ok:true});}catch{report.outcome({seller:account.seller,cycle,started:true,ok:false,reason:guard()??'scenario-failed'});}
  }
 }));
 if(stage==='clean'&&!guard()&&Date.now()<start+operationLimits.durationMs)await delay(start+operationLimits.durationMs-Date.now());
 assert.equal(report.counts.planned,cycles*2);return report.counts;
}
async function serveOwned(root:string){
 dataset(root);if(!process.send||process.env.PGHOST!==join(root,'socket'))throw Error('owned-parent-ipc-required');
 const [{server},{mutate,view},{worker},{checkSchema}]=await Promise.all([import('./server.js'),import('./dashboard.js'),import('./worker.js'),import('./db.js')]);
 const p=pool(),app=server(p,mutate,view),snapshot=instrument(p,app);let stop:(()=>Promise<void>)|undefined,timer:ReturnType<typeof setInterval>|undefined,closing=false;
 const close=async()=>{if(closing)return;closing=true;if(timer)clearInterval(timer);await Promise.all([new Promise<void>(r=>app.close(()=>r())),stop?.()]);await p.end();process.disconnect?.();};
 process.on('SIGTERM',()=>void close());process.on('SIGINT',()=>void close());process.on('disconnect',()=>void close());
 try{await checkSchema(p);stop=await worker(p);await new Promise<void>((resolve,reject)=>{app.once('error',reject);app.listen(0,'127.0.0.1',resolve);});const addr=app.address();assert.ok(addr&&typeof addr!=='string');process.send({type:'ready',base:`http://127.0.0.1:${addr.port}`,pid:process.pid,telemetry:snapshot()});timer=setInterval(()=>process.send?.({type:'telemetry',value:snapshot()}),1000);}
 catch{process.send?.({type:'startup-error',code:'database-or-schema-not-ready-retry-same-dataset-never-reseed'});await close();process.exitCode=1;}
}
async function stopOwned(child:ChildProcess){
 if(child.exitCode!==null||child.signalCode)return;const exited=new Promise<void>(r=>child.once('exit',()=>r()));child.kill('SIGTERM');
 let timer:ReturnType<typeof setTimeout>|undefined;await Promise.race([exited,new Promise<void>(r=>{timer=setTimeout(r,30000);})]);if(timer)clearTimeout(timer);
 if(child.exitCode===null&&!child.signalCode){child.kill('SIGKILL');await exited;}
}
export async function runOperations(root:string,output:string,stage:'smoke'|'clean'){
 operationsSelfCheck();const {record,database}=dataset(root),report=evidence(root,output),planned=stage==='clean'?operationLimits.planned:2;
 const locks=join(root,'locks');if(!existsSync(locks))mkdirSync(locks,{mode:0o700});ownedDirectory(locks);const lock=await holdLock(join(locks,'operations.lock'));
 const logs=openSync(join(output,'application.log'),'wx',0o600),child=fork(fileURLToPath(import.meta.url),['serve-owned',root],{env:{PATH:process.env.PATH,LANG:'C.UTF-8',PGHOST:join(root,'socket')},stdio:['ignore',logs,logs,'ipc']});
 process.env.PGHOST=join(root,'socket');const p=pool();let metrics:OperationsMetrics|undefined,timer:ReturnType<typeof setInterval>|undefined,busy=false,phase='startup',signal:string|undefined,telemetry:any,window:{phase:string;count:number;sum:number;start:number;end:number}|undefined;
 const interrupted=()=>{signal='operator-interrupted';};process.on('SIGINT',interrupted);process.on('SIGTERM',interrupted);
 const result:Record<string,any>={stage,planned,revision:record.revision,sourceDirty:record.sourceDirty,sourceArchiveSha256:record.sourceArchiveSha256,host:hostname(),limits:operationLimits,status:'inconclusive',accounting:'serve-process RSS plus concurrent database cgroup; runner separate'};
 const guard=()=>signal??report.failure??metrics?.abort??(child.exitCode!==null||child.signalCode?'application-exited':undefined);
 const wait=async(ms:number)=>{const end=Date.now()+ms;while(Date.now()<end){if(guard())throw Error('admission-stopped');await delay(Math.min(1000,end-Date.now()));}};
 const sample=async()=>{if(busy){if(metrics){metrics.summary.missing++;metrics.abort??='overlapping-resource-sample';}return;}busy=true;try{const rss=metrics!.sample(phase);if(window&&rss!==undefined){window.count++;window.sum+=rss;window.end=Date.now();}if(metrics!.summary.samples%10===0)await metrics!.storage(p,phase);}catch{if(metrics)metrics.abort??='storage-accounting-unavailable';}finally{busy=false;}};
 try{
  report.write({type:'predeclared',...result,seed:record.id,capture:false,browser:false,aiCredentials:false});
  let timeout:ReturnType<typeof setTimeout>|undefined;
  const ready=await new Promise<{base:string;telemetry:any}>((resolve,reject)=>{timeout=setTimeout(()=>reject(Error('application-readiness-timeout')),30000);child.on('message',(message:any)=>{if(message.type==='ready')resolve(message);if(message.type==='telemetry'){telemetry=message.value;if(metrics)metrics.latestTelemetry=telemetry;}if(message.type==='startup-error')reject(Error(message.code));});child.once('exit',()=>reject(Error('application-startup-exit')));child.once('error',reject);}).finally(()=>{if(timeout)clearTimeout(timeout);});
  metrics=new OperationsMetrics(root,output,child.pid!,database,value=>report.write(value));metrics.latestTelemetry=telemetry??ready.telemetry;
  assert.equal((await p.query('SELECT current_user')).rows[0].current_user,'trading_runtime');result.runtimeRole='trading_runtime';
  const initial=await metrics.storage(p,'initial');result.initial=initial;phase='baseline';await sample();timer=setInterval(()=>void sample(),1000);await wait(operationLimits.baselineMs);if(guard())throw Error('baseline-admission-denied');
  phase=stage;result.outcomes=await workload(root,ready.base,p,stage,report,guard);if(report.counts.failed)throw Error('planned-transaction-failed');
  phase='drain';let settled=await metrics.storage(p,phase);
  if(stage==='clean'){
   const deadline=Date.now()+16*60000;
   while(settled.inbox.pending||settled.held||settled.queue.some(q=>q.count>0)){if(Date.now()>=deadline)throw Error('backlog-did-not-settle');await wait(1000);settled=await metrics.storage(p,phase);}
   const fixed=settled.orders.reduce((n,r)=>n+r.count,0);
   for(const name of ['settled-1','settled-2']){phase=name;window={phase:name,count:0,sum:0,start:Date.now(),end:0};await wait(operationLimits.settledMs);const current=window;window=undefined;metrics.summary.windows.push({phase:name,count:current.count,meanRss:current.count?current.sum/current.count:0,start:current.start,end:current.end});const state=await metrics.storage(p,name);assert.equal(state.orders.reduce((n,r)=>n+r.count,0),fixed);assert.equal(state.inbox.pending,0);assert.equal(state.held,0);assert.equal(state.queue.length,0);assert.ok(current.count>=298&&current.end-current.start>=298000);}
   assert.ok(metrics.summary.windows[1]!.meanRss<=metrics.summary.windows[0]!.meanRss+64*1024**2);
  }
  result.final=await metrics.storage(p,'final');assert.equal(result.final.commits-initial.commits,planned);assert.equal(result.final.inbox.pending,0);assert.equal(result.final.held,0);
  result.latency={reads:report.reads.snapshot(),mutationsWithRedirect:report.mutations.snapshot(),syntheticVisibility:report.visibility.snapshot()};assert.ok(result.latency.reads.p95Ms<=500);assert.ok(result.latency.mutationsWithRedirect.p95Ms<=1000);assert.ok(result.latency.syntheticVisibility.p95Ms<=10000);if(guard())throw Error('resource-gate-failed');result.status='passed';
 }catch(error){result.status=metrics?.abort?'failed':phase==='startup'||phase==='baseline'?'blocked':'failed';result.reason=guard()??(error instanceof Error?error.message:'operations-failed');}
 finally{
  if(timer)clearInterval(timer);while(busy)await delay(20);result.resources=metrics?.summary;result.lastTelemetry=metrics?.latestTelemetry;result.outcomes={...report.counts,planned,recorded:report.counts.planned,failed:planned-report.counts.passed,notAttempted:planned-report.counts.attempted};result.finishedAt=new Date().toISOString();
  try{writeJson(join(output,'summary.json'),result);if(!report.failure)report.write({type:'summary',...result});}
  finally{await stopOwned(child);closeSync(logs);await p.end();lock.stdin.end();await new Promise<void>(r=>lock.once('exit',()=>r()));report.close();process.off('SIGINT',interrupted);process.off('SIGTERM',interrupted);}
 }
 return result;
}
export function operationsSelfCheck(){
 assert.equal(operationLimits.sellers,2);assert.equal(operationLimits.cycles*2,operationLimits.planned);assert.equal(operationLimits.cycles*operationLimits.cadenceMs,operationLimits.durationMs);
 assert.equal(stableRun('seed','a',0),stableRun('seed','a',0));assert.notEqual(stableRun('seed','a',0),stableRun('seed','b',0));assert.notEqual(stableRun('seed','a',0),stableRun('seed','a',1));assert.throws(()=>stableRun('seed','a',1000));
 return {passed:true,planned:operationLimits.planned,concurrency:2,durationMs:operationLimits.durationMs};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const [command,root,argument]=process.argv.slice(2);
 if(command==='self-check')console.log(JSON.stringify(operationsSelfCheck()));
 else if(command==='prepare')console.log(JSON.stringify(await prepareOperations(root!,argument!)));
 else if(command==='serve-owned')await serveOwned(root!);
 else if(command==='smoke'||command==='clean'){const result=await runOperations(root!,argument!,command);console.log(JSON.stringify({status:result.status,planned:result.planned,outcomes:result.outcomes,output:argument}));if(result.status!=='passed')process.exitCode=1;}
 else throw Error('operations: self-check | prepare NEW_ROOT podman|docker | smoke|clean ROOT NEW_EVIDENCE_PATH');
}
