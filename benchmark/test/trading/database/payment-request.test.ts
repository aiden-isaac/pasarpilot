import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accounts,id,trade } from './helpers.js';
import { pool,tx } from '../../../src/trading/db.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { allocate } from '../../../src/trading/stock.js';
import { instructions,terms,paymentDraft } from '../../../src/trading/payments.js';
import { approve } from '../../../src/trading/proposals.js';
test('payment requests require approved instructions and known exact total; changed instructions block delivery',async()=>{
 const [a]=await accounts(),p=pool(),w=new Workspace(p,a.seller_id);try{
 const t=await trade(w),o=id();await tx(p,c=>allocate(c,w.seller,{id:o,item:t.item,buyer:'buyer-a',conversation:t.conv,quantity:1,position:1,kind:'claim'}));
 let v=(await p.query('SELECT instruction_version FROM trading.sellers WHERE id=$1',[w.seller])).rows[0].instruction_version;
 await instructions(w,v++,'Synthetic account: DEMO ONLY',true);await terms(w,o,1,'postage',null);await assert.rejects(paymentDraft(w,o,2),/fee/);
 await terms(w,o,2,'collection',0);const d=await paymentDraft(w,o,3);assert.equal(await paymentDraft(w,o,3),d);
 await instructions(w,v++,'Synthetic changed account: DEMO ONLY',true);assert.equal(await approve(w,d,1),'stale');
 const current=await paymentDraft(w,o,3);assert.equal(await approve(w,current,1),'delivered');
 const sent=(await p.query('SELECT instructions FROM trading.deliveries WHERE seller_id=$1 AND id=$2',[w.seller,current])).rows[0];assert.equal(sent.instructions.amount,1000);assert.equal((await w.get('orders',o)).payment,'unverified');
 }finally{await p.end();}
});
