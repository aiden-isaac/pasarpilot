import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accounts,payable } from './helpers.js';
import { pool } from '../../../src/trading/db.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { confirmPayment } from '../../../src/trading/payments.js';
import { cancel } from '../../../src/trading/reviews.js';
import { sweep } from '../../../src/trading/stock.js';
test('explicit exact trusted verification commits once; buyer assertions and paid cancellation cannot restock',async()=>{
 const [a]=await accounts(),p=pool(),w=new Workspace(p,a.seller_id);try{
 const t=await payable(w);assert.equal((await w.get('orders',t.order)).payment,'unverified');await assert.rejects(confirmPayment(w,t.order,2,1000,false),/attestation/);
 assert.equal(await confirmPayment(w,t.order,2,1000,true),'seller_verified');assert.equal(await confirmPayment(w,t.order,2,1000,true),'seller_verified');
 assert.equal((await w.get('inventory',t.inv)).unsold,0);assert.equal((await w.get('inventory',t.inv)).reserved,0);
 assert.equal(await cancel(w,t.order,3,'paid cancellation'),'review');await sweep(w);assert.equal((await w.get('inventory',t.inv)).unsold,0);
 const wrong=await payable(w);assert.equal(await confirmPayment(w,wrong.order,2,999,true),'review');assert.equal((await w.get('orders',wrong.order)).payment,'unverified');
 }finally{await p.end();}
});
test('payment versus cancellation and expired hold serialize without lost-stock revival',async()=>{
 const [a]=await accounts(),p=pool(),q=pool(),w=new Workspace(p,a.seller_id);try{
 const t=await payable(w);await Promise.allSettled([confirmPayment(w,t.order,2,1000,true),cancel(new Workspace(q,w.seller),t.order,2,'race')]);
 const o=await w.get('orders',t.order),inv=await w.get('inventory',t.inv);assert.equal(inv.reserved,0);assert.equal(inv.unsold,o.state==='paid'?0:1);
 const late=await payable(w);await p.query("UPDATE trading.reservations SET expires_at=now()-interval '1 second' WHERE seller_id=$1 AND id=$2",[w.seller,late.order]);
 assert.equal(await confirmPayment(w,late.order,2,1000,true),'review');assert.equal((await w.get('orders',late.order)).state,'expired');assert.equal((await w.get('inventory',late.inv)).unsold,1);
 }finally{await p.end();await q.end();}
});
