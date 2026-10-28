import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync,fork } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync,chmodSync,lstatSync,realpathSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { operationsTest,application,within30 } from './helpers.js';
import { tx } from '../../../src/trading/db.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { httpClient } from '../../../src/trading/operations.js';
import { payable,trade,id } from '../database/helpers.js';
import { confirmPayment } from '../../../src/trading/payments.js';
import { startDemo,demoStep } from '../../../src/trading/demo.js';
import { generate } from '../../../src/trading/intake.js';
import { queue } from '../../../src/trading/db.js';
import { OperationsMetrics } from '../../../src/trading/operations-metrics.js';

test('owned browser-free database and application recovery retain accepted work',{timeout:180000},async t=>{
 const ctx=operationsTest('recovery'),{root,database,report,admin,p,accounts}=ctx,w=new Workspace(p,accounts[0]!.seller);let app=await application(root,report,'initial');
 try{
  const metrics=new OperationsMetrics(root,report.output,app.pid,database,value=>report.write(value));metrics.latestTelemetry=app.telemetry;assert.ok(metrics.sample('fault-preflight'));
  await t.test('idle pool disconnection is handled and the same process reconnects',async()=>{
   const terminated=await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND usename='trading_runtime' AND state='idle'");assert.ok(terminated.rowCount);
   await delay(300);assert.equal(app.child.exitCode,null);const ms=await within30(async()=>{const r=await fetch(app.base+'/login');return r.status===200;});report.write({type:'recovery',case:'idle-pool',ms});
  });
  await t.test('in-flight failure rolls back and preserves the original database error',async()=>{
   const marker=id();let original:unknown;
   await assert.rejects(tx(p,async c=>{await c.query("INSERT INTO trading.activity(seller_id,action,record_id,version,actor,reason) VALUES($1,'fault_uncommitted',$2,1,'test','synthetic')",[w.seller,marker]);const pid=(await c.query('SELECT pg_backend_pid() pid')).rows[0].pid;
    const pending=c.query('SELECT pg_sleep(5)').catch(error=>{original=error;throw error;});await admin.query('SELECT pg_terminate_backend($1)',[pid]);await pending;
   }),error=>{assert.equal(error,original);assert.equal((error as {code:string}).code,'57P01');return true;});
   assert.equal((await p.query('SELECT count(*)::int n FROM trading.activity WHERE seller_id=$1 AND record_id=$2',[w.seller,marker])).rows[0].n,0);await p.query('SELECT 1');
  });
  await t.test('startup 57P03 fails clearly without reseeding',async()=>{
   const socket=join(report.output,'starting');mkdirSync(socket,{mode:0o700});const server=createServer(s=>{s.once('data',()=>{const body=Buffer.from('SFATAL\0C57P03\0Mthe database system is starting up\0\0'),header=Buffer.alloc(5);header[0]=69;header.writeInt32BE(body.length+4,1);s.end(Buffer.concat([header,body]));});});await new Promise<void>(r=>server.listen(join(socket,'.s.PGSQL.5432'),r));
   try{const child=fork(new URL('../../../src/trading/cli.js',import.meta.url),['serve'],{execArgv:[],env:{PATH:process.env.PATH,PGHOST:socket},stdio:['ignore','pipe','pipe','ipc']});let output='';child.stderr!.on('data',b=>{output+=b;});assert.equal(await new Promise<number|null>(r=>child.once('exit',r)),1);assert.match(output,/retry serve with the same dataset, never reseed/);assert.doesNotMatch(output,/password|SELECT|stack/);report.write({type:'recovery',case:'57P03-startup',safeRetry:true});}
   finally{await new Promise<void>(r=>server.close(()=>r()));}
  });
  await t.test('owned database restart and app restart preserve held paid and pending work',async()=>{
   const held=await payable(w),paid=await payable(w);await confirmPayment(w,paid.order,2,1000,true);
   const run=id();await startDemo(w,run);await demoStep(w,run,'claim-a');await demoStep(w,run,'backup-b');const first=(await p.query("SELECT id FROM trading.orders WHERE seller_id=$1 AND item_id=$2 AND buyer='buyer-a'",[w.seller,'demo-item:'+run])).rows[0].id;
   const source=(await p.query('SELECT * FROM trading.sources WHERE seller_id=$1',[w.seller])).rows[0],pending=await trade(w);await generate(p,queue(p),source.tenant,{event:'restart:'+id(),item:pending.item,actor:'buyer-a',message:'claim',kind:'reply'});
   await app.close();await p.query("UPDATE trading.reservations SET expires_at=now()-interval '1 second' WHERE seller_id=$1 AND id=$2",[w.seller,first]);
   execFileSync(database.runtime,['restart',database.container],{timeout:30000,stdio:'pipe'});const ready=await within30(async()=>{await admin.query('SELECT version FROM trading.migrations');return true;});report.write({type:'recovery',case:'database-readiness',ms:ready});
   // The image entrypoint restores 3775 on restart; the verified private socket must be 0700 again.
   assert.equal(realpathSync(database.socket),database.socket);assert.equal(lstatSync(database.socket).uid,process.getuid!());chmodSync(database.socket,0o700);
   const start=Date.now();app=await application(root,report,'restarted');const resumed=await within30(async()=>{const row=(await w.get('orders',first));return row.state==='expired'&&(await p.query("SELECT 1 FROM trading.orders WHERE seller_id=$1 AND item_id=$2 AND buyer='buyer-b' AND state='awaiting_payment'",[w.seller,'demo-item:'+run])).rowCount===1;});assert.ok(Date.now()-start<30000);report.write({type:'recovery',case:'restart-reconcile',ms:resumed,totalMs:Date.now()-start});
   assert.equal((await w.get('orders',held.order)).state,'awaiting_payment');assert.equal((await w.get('orders',paid.order)).state,'paid');assert.equal((await w.get('inventory',paid.inv)).unsold,0);assert.equal((await p.query('SELECT count(*)::int n FROM trading.orders WHERE seller_id=$1 AND item_id=$2',[w.seller,pending.item])).rows[0].n,1);
  });
  await t.test('commit acknowledgement loss and HTTP response loss permit safe replay',async()=>{
   const sale=await payable(w);
   // Discard a real successful COMMIT reply at the client boundary, never retry tx implicitly.
   const c=await p.connect(),query=c.query.bind(c);let lost=false;c.query=((...args:any[])=>{const result=(query as Function)(...args);if(args[0]==='COMMIT'&&!lost){lost=true;return result.then(()=>{throw Error('synthetic-lost-commit-ack');});}return result;}) as typeof c.query;c.release();
   await assert.rejects(confirmPayment(w,sale.order,2,1000,true),/synthetic-lost-commit-ack/);assert.equal(await confirmPayment(w,sale.order,2,1000,true),'seller_verified');
   assert.equal((await p.query("SELECT count(*)::int n FROM trading.activity WHERE seller_id=$1 AND record_id=$2 AND action='payment_verified_and_stock_committed'",[w.seller,sale.order])).rows[0].n,1);
   const client=await httpClient(app.base,accounts[1]!,report,()=>undefined),run=id(),page=await client.get('/?view=demo'),csrf=page.match(/name="csrf" value="([^"]+)"/)?.[1];assert.ok(csrf);
   const body=new URLSearchParams({run,csrf}).toString();
   await new Promise<void>((resolve,reject)=>{const req=request(app.base+'/demo-start',{method:'POST',headers:{cookie:client.cookie(),origin:app.base,'content-type':'application/x-www-form-urlencoded','content-length':Buffer.byteLength(body)}},response=>{response.destroy();resolve();});req.once('error',reject);req.end(body);});
   await within30(async()=>(await p.query('SELECT 1 FROM trading.items WHERE seller_id=$1 AND id=$2',[accounts[1]!.seller,'demo-item:'+run])).rowCount===1);const before=(await p.query('SELECT count(*)::int n FROM trading.activity WHERE seller_id=$1',[accounts[1]!.seller])).rows[0].n;
   // HTTP caller discards the response, then inspects/retries the identical stable run.
   await client.post('/demo-start',{run});assert.equal((await p.query('SELECT count(*)::int n FROM trading.activity WHERE seller_id=$1',[accounts[1]!.seller])).rows[0].n,before);assert.equal((await p.query('SELECT count(*)::int n FROM trading.items WHERE seller_id=$1 AND id=$2',[accounts[1]!.seller,'demo-item:'+run])).rows[0].n,1);
  });
  await t.test('running application and expiry reconnect after the owned database restarts',async()=>{
   const held=await payable(w);await p.query("UPDATE trading.reservations SET expires_at=now()-interval '1 second' WHERE seller_id=$1 AND id=$2",[w.seller,held.order]);
   execFileSync(database.runtime,['restart',database.container],{timeout:30000,stdio:'pipe'});await within30(async()=>{await admin.query('SELECT version FROM trading.migrations');return true;});
   assert.equal(realpathSync(database.socket),database.socket);assert.equal(lstatSync(database.socket).uid,process.getuid!());chmodSync(database.socket,0o700);
   const ms=await within30(async()=>(await w.get('orders',held.order)).state==='expired');assert.equal(app.child.exitCode,null);assert.equal((await w.get('inventory',held.inv)).reserved,0);report.write({type:'recovery',case:'live-reconnect-expiry',ms});
   const client=await httpClient(app.base,accounts[1]!,report,()=>undefined);await client.get('/updates');
  });
 }finally{await app.close();await p.end();await admin.end();report.close();}
});
