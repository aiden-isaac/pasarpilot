import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync,writeFileSync,readFileSync } from 'node:fs';
import { join } from 'node:path';
import { operationsTest,application,within30 } from './helpers.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { payable,trade,id } from '../database/helpers.js';
import { generate } from '../../../src/trading/intake.js';
import { queue } from '../../../src/trading/db.js';
import { sale,httpClient } from '../../../src/trading/operations.js';

test('optional capture and one failing stream cannot block local expiry or healthy sellers',{timeout:90000},async t=>{
 const {root,report,p,admin,accounts}=operationsTest('dependency-outage'),a=new Workspace(p,accounts[0]!.seller),b=new Workspace(p,accounts[1]!.seller);
 const expire=async(w:Workspace)=>{const order=await payable(w);await p.query("UPDATE trading.reservations SET expires_at=now()-interval '1 second' WHERE seller_id=$1 AND id=$2",[w.seller,order.order]);return order;};
 try{
  await t.test('missing explicitly enabled capture leaves startup expiry working',async()=>{
   const order=await expire(a),missing=join(report.output,'capture-unavailable'),app=await application(root,report,'missing-capture',missing);
   try{assert.equal((await a.get('orders',order.order)).state,'expired');assert.equal((await a.get('inventory',order.inv)).reserved,0);report.write({type:'dependency',case:'missing-capture',expired:true});}
   finally{await app.close();}
   assert.match(readFileSync(join(report.output,'missing-capture.log'),'utf8'),/trading-capture-unavailable/);
  });
  await t.test('invalid capture and a failing first seller retain evidence while the other seller progresses',async()=>{
   const capture=join(report.output,'invalid-capture'),attempt=id(),attemptDir=join(capture,'attempts',attempt);mkdirSync(attemptDir,{recursive:true,mode:0o700});const invalid='{"synthetic":"invalid capture"';writeFileSync(join(attemptDir,'trading-events.json'),invalid,{mode:0o600});
   const source=(await p.query('SELECT * FROM trading.sources WHERE seller_id=$1',[a.seller])).rows[0],item=await trade(a),accepted=await generate(p,queue(p),source.tenant,{event:'failing-stream:'+id(),item:item.item,actor:'buyer-a',message:'claim',kind:'reply'});
   const original=(await p.query('SELECT envelope FROM trading.inbox WHERE seller_id=$1 AND id=$2',[a.seller,accepted.id])).rows[0].envelope;
   // Fault injection changes only this disposable envelope; retain the original and restore it after the case.
   writeFileSync(join(report.output,'injected-source.json'),JSON.stringify({id:accepted.id,original}),{mode:0o600});await admin.query("UPDATE trading.inbox SET envelope=jsonb_set(envelope,'{version}','2') WHERE seller_id=$1 AND id=$2",[a.seller,accepted.id]);
   const healthy=await expire(b),app=await application(root,report,'invalid-capture',capture);
   try{
    const ms=await within30(async()=>(await b.get('orders',healthy.order)).state==='expired');assert.equal((await p.query('SELECT result FROM trading.inbox WHERE seller_id=$1 AND id=$2',[a.seller,accepted.id])).rows[0].result,'pending');assert.equal(readFileSync(join(attemptDir,'trading-events.json'),'utf8'),invalid);
    const client=await httpClient(app.base,accounts[1]!,report,()=>undefined);await sale(p,client,b.seller,id(),report);report.write({type:'dependency',case:'invalid-capture-and-stream',healthyExpiryMs:ms,syntheticSale:true,preservedSource:true});
   }finally{await app.close();await admin.query('UPDATE trading.inbox SET envelope=$3 WHERE seller_id=$1 AND id=$2',[a.seller,accepted.id,original]);}
   const log=readFileSync(join(report.output,'invalid-capture.log'),'utf8');assert.match(log,/trading-capture-unavailable/);assert.match(log,/trading-source-retry/);assert.doesNotMatch(log,/invalid capture|claim|password|SELECT|sourceTime/);
  });
  await t.test('capture unset and no scheduler browser or model environment are required',async()=>{
   const order=await expire(a),app=await application(root,report,'no-external-dependencies');try{
    assert.equal((await a.get('orders',order.order)).state,'expired');const env=readFileSync(`/proc/${app.pid}/environ`,'utf8');assert.doesNotMatch(env,/OPENROUTER|OPENAI_API|TRADING_CAPTURE_ROOT|SCHEDULER/);const children=readFileSync(`/proc/${app.pid}/task/${app.pid}/children`,'utf8').trim();assert.equal(children,'');
    const client=await httpClient(app.base,accounts[0]!,report,()=>undefined);await sale(p,client,a.seller,id(),report);report.write({type:'dependency',case:'no-external-dependencies',syntheticSale:true,childProcesses:0});
   }finally{await app.close();}
  });
 }finally{await p.end();await admin.end();report.close();}
});
