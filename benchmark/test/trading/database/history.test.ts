import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accounts,payable } from './helpers.js';
import { pool } from '../../../src/trading/db.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { confirmPayment } from '../../../src/trading/payments.js';
import { history,timeline,sharedInstructions } from '../../../src/trading/history.js';
test('history survives connection restart is tenant-scoped and replay adds no audit transitions',async()=>{
 const [a,b]=await accounts();let p=pool(),w=new Workspace(p,a.seller_id);let order='';try{
 const t=await payable(w);order=t.order;await confirmPayment(w,order,2,1000,true);const before=(await timeline(w,order)).rows;await confirmPayment(w,order,2,1000,true);assert.equal((await timeline(w,order)).rows.length,before.length);
 await p.end();p=pool();w=new Workspace(p,a.seller_id);assert.ok((await history(w,'paid','buyer-a')).rows.some(o=>o.id===order));assert.ok((await sharedInstructions(w,order)).rows[0]!.instructions.instruction_snapshot);
 assert.ok((await timeline(w,order)).rows.some(a=>a.action==='payment_verified_and_stock_committed'));await assert.rejects(timeline(new Workspace(p,b.seller_id),order),/not-found/);
 assert.ok(!(await timeline(w,order)).rows.some(a=>/password|session=|DEMO ONLY synthetic payment account/.test(a.reason)));
 }finally{await p.end();}
});
