import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { initialise,writeJson } from '../storage.js';
import { sampleHost,minecraftPids } from '../host.js';
import { budget,PressureGuard } from '../metrics.js';
import { sampleServices } from '../scheduler-metrics.js';
import { SchedulerStore } from '../scheduler-store.js';
import { executeJob,recoverJobs } from '../scheduler.js';
import { holdLock } from '../ownership.js';
import { pool,queue } from './db.js';
import { migrate } from './migrate.js';
import { seed } from './setup.js';
import { Workspace } from './workspace.js';
import { inventory,listing,item } from './catalog.js';
import { synthetic } from './intake.js';
import { importHandoffs } from './capture.js';
import { worker } from './worker.js';
import { listen } from './server.js';
import { mutate,view } from './dashboard.js';
import { processStream } from './consumer.js';
import { handle } from './stock.js';
export async function prepare(root:string) {
 initialise(root);const p=pool('fixture');
 try {
  await migrate(p);const passwords=[randomBytes(24).toString('hex'),randomBytes(24).toString('hex')];const ids=await seed(p,passwords);
  writeJson(join(root,'demo-passwords.json'),passwords);
  const w=new Workspace(p,ids[0]!),inv=await inventory(w,{name:'Synthetic Lightning Bolt',printing:'SYN',collector:'1',language:'English',finish:'nonfoil',condition:'NM',unsold:1,price:1000}),post=await listing(w,'Synthetic RM10 WTS'),it=await item(w,post,inv,1);
  const mapping=(await p.query("SELECT * FROM trading.sources WHERE tenant='seller-a'")).rows[0];
  const events=[synthetic({source:mapping.source,epoch:mapping.epoch},1,it),synthetic({source:mapping.source,epoch:mapping.epoch},2,it,'buyer-b')];
  writeJson(join(root,'trading-fixture.json'),{'seller-a':events});writeJson(join(root,'trading-capture.json'),{enabled:true});
  writeJson(join(root,'trading-demo.json'),{seller:ids[0],inventory:inv,item:it,mapping});
 }finally{await p.end();}
 const store=await SchedulerStore.open(root,true);try{writeJson(join(root,'scheduler.json'),{schemaVersion:1,root,node:process.version,pgBoss:'10.4.2',pg:'8.23.1',postgres:(await store.pool.query('SHOW server_version')).rows[0].server_version});}finally{await store.close();}
}
export async function run(root:string) {
 if(minecraftPids().length)throw Error('host-preparation-required-no-service-will-be-stopped');
 const lock=await holdLock(join(root,'locks','supervisor.lock')),p=pool(),store=await SchedulerStore.open(root);
 const stop=await worker(p),app=await listen(p,0,mutate,view),addr=app.address();assert.ok(addr&&typeof addr!=='string');
 const report:Record<string,any>={schemaVersion:1,complete:false,baseline:[],services:[]};const output=()=>writeJson(join(root,'runs','trading-capture-demo.json'),report);
 const collector=setInterval(()=>{try{report.services.push(sampleServices(root));}catch(e){report.resourceError=(e as Error).message;}},1000);
 try {
  const guard=new PressureGuard();for(let n=0;n<=60;n++){const host=sampleHost();guard.check(host);report.baseline.push(host);report.services.push(sampleServices(root));if(n<60)await delay(1000);}
  const manifest={schemaVersion:1 as const,poolBudget:budget(report.baseline),minecraftStopped:true};writeJson(join(root,'manifest.json'),manifest);report.manifest=manifest;
  await recoverJobs(store);await store.configure('seller-b',false);await store.configure('seller-c',false);await store.tick();
  const job=await store.claim();assert.ok(job);assert.equal(job.data.tenant,'seller-a');
  const result=await executeJob(store,job,manifest);report.browser=result;assert.equal(result.outcome,'completed');await store.finish(job,result);
  await importHandoffs(p,queue(p),root);
  const demo=JSON.parse(readFileSync(join(root,'trading-demo.json'),'utf8'));await processStream(p,demo.seller,demo.mapping.source,demo.mapping.epoch,handle);
  const w=new Workspace(p,demo.seller),o=(await p.query('SELECT * FROM trading.orders WHERE seller_id=$1 AND item_id=$2',[w.seller,demo.item])).rows[0];assert.ok(o);assert.equal((await w.get('inventory',demo.inventory)).reserved,1);
  const backup=(await p.query("SELECT * FROM trading.claims WHERE seller_id=$1 AND item_id=$2 AND buyer='buyer-b'",[w.seller,demo.item])).rows[0];assert.equal(backup.state,'backup');
  const base=`http://127.0.0.1:${addr.port}`,page=await fetch(base+'/login'),loginCookie=page.headers.get('set-cookie')!.split(';')[0]!,html=await page.text(),csrf=html.match(/name="csrf" value="([^"]+)"/)![1]!;
  const passwords=JSON.parse(readFileSync(join(root,'demo-passwords.json'),'utf8'));
  const signed=await fetch(base+'/login',{method:'POST',redirect:'manual',headers:{origin:base,cookie:loginCookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf,login:'seller-a',password:passwords[0]})});assert.equal(signed.status,303);
  const cookie=signed.headers.get('set-cookie')!.split(';')[0]!,workspace=await fetch(base,{headers:{cookie}});assert.equal(workspace.status,200);const body=await workspace.text(),token=body.match(/name="csrf" value="([^"]+)"/)![1]!;
  const post=async(path:string,data:Record<string,string>)=>{const r=await fetch(base+path,{method:'POST',redirect:'manual',headers:{origin:base,cookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:token,...data})});assert.equal(r.status,303,`dashboard ${path} failed`);};
  await post('/instructions',{version:'1',instructions:'DEMO ONLY synthetic payment account',approved:'yes'});
  await post('/terms',{id:o.id,version:'1',method:'collection',fee:'0.00'});await post('/payment-draft',{id:o.id,version:'2'});
  const draft=(await p.query("SELECT id FROM trading.drafts WHERE seller_id=$1 AND order_id=$2 AND kind='payment'",[w.seller,o.id])).rows[0];await post('/approve',{id:draft.id,version:'1'});
  await post('/confirm-payment',{id:o.id,version:'2',amount:'10.00',trusted:'yes'});await post('/arrange',{id:o.id,version:'3',location:'Synthetic game shop',time:new Date().toISOString()});
  await post('/fulfil',{id:o.id,version:'4',status:'collected',evidence:'Seller confirmed actual synthetic handover'});await post('/complete',{id:o.id,version:'5'});
  const final=await w.get('inventory',demo.inventory);assert.equal(final.unsold,0);assert.equal(final.reserved,0);assert.equal((await w.get('orders',o.id)).state,'completed');
  report.trade={state:'completed',priceSen:1000,stock:0,reserved:0,primaryOrders:1,backup:(await w.get('claims',backup.id)).state};
  report.scheduler=await store.status();assert.ok(!report.resourceError);assert.equal(minecraftPids().length,0);report.complete=true;
 }catch(e){report.error=(e as Error).message;throw e;}
 finally{clearInterval(collector);report.services.push(sampleServices(root));output();await stop();app.closeAllConnections();await new Promise<void>(r=>app.close(()=>r()));await p.end();await store.close();lock.stdin.end();}
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
 const root=process.argv[3];if(!root?.startsWith('/'))throw Error('explicit-private-root-required');
 if(process.env.PGHOST!==join(root,'socket'))throw Error('matching-dataset-socket-required');
 if(process.argv[2]==='prepare')await prepare(root);else if(process.argv[2]==='run')await run(root);else throw Error('prepare-or-run-required');
}
