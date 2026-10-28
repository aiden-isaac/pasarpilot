import { test } from 'node:test';
import assert from 'node:assert/strict';
import { operationsTest,application } from './helpers.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { pool,tx,queue } from '../../../src/trading/db.js';
import { generate } from '../../../src/trading/intake.js';
import { payable,trade,id } from '../database/helpers.js';
import { allocate,sweep } from '../../../src/trading/stock.js';
import { confirmPayment } from '../../../src/trading/payments.js';
import { cancel } from '../../../src/trading/reviews.js';
import { startDemo,demoStep } from '../../../src/trading/demo.js';
import { httpClient } from '../../../src/trading/operations.js';
import { logout } from '../../../src/trading/auth.js';
import { createHash } from 'node:crypto';

test('real races and terminal replays preserve stock audit and revoked sessions across restart',{timeout:60000},async()=>{
 const {root,report,p,admin,accounts}=operationsTest('invariants'),q=pool(),a=new Workspace(p,accounts[0]!.seller),b=new Workspace(q,accounts[0]!.seller);let app=await application(root,report,'before');
 try{
  const one=await trade(a),first=id(),second=id(),request={id:first,item:one.item,buyer:'buyer-a',conversation:one.conv,quantity:1,position:1,kind:'claim' as const};
  const results=await Promise.all([tx(p,c=>allocate(c,a.seller,request)),tx(q,c=>allocate(c,a.seller,{...request,id:second,buyer:'buyer-b',conversation:one.convB,position:2}))]);assert.deepEqual(results.sort(),['backup','primary']);assert.equal((await a.get('inventory',one.inv)).reserved,1);
  const paid=await payable(a);assert.deepEqual(await Promise.all([confirmPayment(a,paid.order,2,1000,true),confirmPayment(b,paid.order,2,1000,true)]),['seller_verified','seller_verified']);
  const late=await payable(a);await p.query("UPDATE trading.reservations SET expires_at=now()-interval '1 second' WHERE seller_id=$1 AND id=$2",[a.seller,late.order]);await Promise.all([sweep(a),confirmPayment(b,late.order,2,1000,true)]);assert.equal((await a.get('orders',late.order)).state,'expired');assert.equal((await a.get('inventory',late.inv)).unsold,1);
  const run=id();await startDemo(a,run);await demoStep(a,run,'claim-a');await demoStep(a,run,'backup-b');const orders=(await p.query("SELECT id,buyer FROM trading.orders WHERE seller_id=$1 AND item_id=$2",[a.seller,'demo-item:'+run])).rows;const primary=orders.find(o=>o.buyer==='buyer-a')!.id;await cancel(a,primary,1,'Synthetic unpaid cancellation');const backup=(await p.query("SELECT id,version FROM trading.orders WHERE seller_id=$1 AND item_id=$2 AND buyer='buyer-b'",[a.seller,'demo-item:'+run])).rows[0];assert.ok(backup);await cancel(a,backup.id,backup.version,'Synthetic backup cancellation');
  const source=(await p.query('SELECT * FROM trading.sources WHERE seller_id=$1',[a.seller])).rows[0],conflict=()=>generate(p,queue(p),source.tenant,{event:'demo:'+run+':claim-a',item:'demo-item:'+run,actor:'buyer-a',message:'conflicting synthetic claim',kind:'reply'});await assert.rejects(conflict(),/identity-conflict/);
  const clients=[await httpClient(app.base,accounts[0]!,report,()=>undefined),await httpClient(app.base,accounts[1]!,report,()=>undefined)],pages=await Promise.all(clients.map(c=>c.get('/?view=settings'))),csrf=pages.map(h=>h.match(/name="csrf" value="([^"]+)"/)![1]!);
  await logout(p,clients[0]!.cookie().split('=')[1]!);const expiredToken=clients[1]!.cookie().split('=')[1]!;await p.query("UPDATE trading.sessions SET expires_at=now()-interval '1 second' WHERE hash=$1",[createHash('sha256').update(expiredToken).digest('hex')]);
  const snapshot=async()=>({paid:await a.get('orders',paid.order),stock:await a.get('inventory',paid.inv),audit:(await p.query('SELECT count(*)::int n FROM trading.activity WHERE seller_id=$1 AND record_id=ANY($2::text[])',[a.seller,[paid.order,late.order,primary,backup.id]])).rows[0].n,deliveries:(await p.query('SELECT count(*)::int n FROM trading.deliveries d JOIN trading.drafts r USING(seller_id,id) WHERE d.seller_id=$1 AND r.order_id=$2',[a.seller,paid.order])).rows[0].n});
  const before=await snapshot();await app.close();app=await application(root,report,'after');await confirmPayment(a,paid.order,2,1000,true);await cancel(a,primary,1,'Synthetic replay');await cancel(a,backup.id,backup.version,'Synthetic replay');await demoStep(a,run,'claim-a');await demoStep(a,run,'backup-b');await assert.rejects(conflict(),/identity-conflict/);assert.deepEqual(await snapshot(),before);
  for(let n=0;n<clients.length;n++){
   const response=await fetch(app.base+'/updates',{headers:{cookie:clients[n]!.cookie()},redirect:'manual'});assert.equal(response.status,401);
   const attempt=await fetch(app.base+'/profile',{method:'POST',headers:{cookie:clients[n]!.cookie(),origin:app.base,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:csrf[n]!,display_name:'forbidden stale session',version:'1'}),redirect:'manual'});assert.equal(attempt.status,401);
  }
  assert.equal((await a.get('inventory',one.inv)).reserved,1);assert.equal((await a.get('inventory',paid.inv)).unsold,0);assert.equal((await a.get('inventory','demo-inventory:'+run)).reserved,0);report.write({type:'invariants',lastUnitRace:true,paymentRace:true,expiryRace:true,promotion:true,replayAuditUnchanged:true,revokedAndExpiredSessionsRejected:true});
 }finally{await app.close();await q.end();await p.end();await admin.end();report.close();}
});
