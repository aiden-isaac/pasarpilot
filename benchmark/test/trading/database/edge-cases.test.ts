import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accounts,id,trade,payable } from './helpers.js';
import { pool,tx,queue } from '../../../src/trading/db.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { inventory,listing,item } from '../../../src/trading/catalog.js';
import { allocate,promote,handle,sweep } from '../../../src/trading/stock.js';
import { cancel,manualPromote } from '../../../src/trading/reviews.js';
import { synthetic,intake } from '../../../src/trading/intake.js';
import { processStream } from '../../../src/trading/consumer.js';
import { policy,offer } from '../../../src/trading/negotiation.js';
import { approve,regenerate } from '../../../src/trading/proposals.js';
import { confirmPayment } from '../../../src/trading/payments.js';
test('missing parent defers processing and source revision retains the hold while blocking sensitive transitions',async()=>{
 const [,b]=await accounts(),p=pool(),boss=queue(p),w=new Workspace(p,b.seller_id);await boss.start();try{
 const n=Number((await p.query('SELECT COALESCE(max(position),0) AS n FROM trading.inbox WHERE seller_id=$1 AND source=$2 AND epoch=$3',[w.seller,b.source,b.epoch])).rows[0].n),key=id();
 const ev=synthetic({source:b.source,epoch:b.epoch},n+1,key);const src=await intake(p,boss,b.tenant,ev);await processStream(p,w.seller,b.source,b.epoch,handle);await assert.rejects(w.get('orders',src.id));
 const inv=await inventory(w,{name:'Synthetic Missing Parent',printing:'SYN',collector:'1',language:'English',finish:'nonfoil',condition:'NM',unsold:1,price:1000});await item(w,await listing(w,'Late mapped parent'),inv,1,key);
 await processStream(p,w.seller,b.source,b.epoch,handle);assert.equal((await w.get('orders',src.id)).quantity,1);
 await intake(p,boss,b.tenant,{...ev,revision:2,position:n+2,text:'claim 2'});await processStream(p,w.seller,b.source,b.epoch,handle);assert.equal((await w.get('orders',src.id)).quantity,1);assert.equal((await w.get('inventory',inv)).reserved,1);
 assert.ok((await p.query('SELECT 1 FROM trading.reviews WHERE seller_id=$1 AND order_id=$2 AND NOT resolved',[w.seller,src.id])).rowCount);
 const d=(await p.query('SELECT * FROM trading.drafts WHERE seller_id=$1 AND order_id=$2',[w.seller,src.id])).rows[0];await assert.rejects(approve(w,d.id,d.version),/stale/);
 }finally{await boss.stop();await p.end();}
});
test('cross-listing promotion is explicit, closed and terminal claims cannot resurrect, repeated claims do not add stock',async()=>{
 const [a]=await accounts(),p=pool(),q=pool(),w=new Workspace(p,a.seller_id);try{
 const t=await trade(w),other=await item(w,await listing(w,'Other item'),t.inv,1),first=id(),backup=id();const base={id:first,item:t.item,buyer:'buyer-a',conversation:t.conv,quantity:1,position:1,kind:'claim' as const};
 const outcomes=await Promise.all([tx(p,c=>allocate(c,w.seller,base)),tx(q,c=>allocate(c,w.seller,{...base,id:id()}))]);assert.deepEqual(outcomes.sort(),['primary','review']);assert.equal((await w.get('inventory',t.inv)).reserved,1);
 await tx(p,c=>allocate(c,w.seller,{...base,id:backup,item:other,buyer:'buyer-b',conversation:t.convB,kind:'backup'}));await cancel(w,first,1,'Unpaid buyer withdrew');assert.equal((await w.get('inventory',t.inv)).reserved,0);assert.equal((await w.get('claims',backup)).state,'backup');
 await manualPromote(w,backup,1,'Explicit cross-listing promotion');assert.equal((await w.get('inventory',t.inv)).reserved,1);await cancel(w,backup,1,'Buyer withdrew');assert.equal(await tx(p,c=>promote(c,w.seller,other)),undefined);
 const paid=await payable(w);await confirmPayment(w,paid.order,2,1000,true);await sweep(w);assert.equal((await w.get('reservations',paid.order)).state,'committed');
 }finally{await p.end();await q.end();}
});
test('lost availability blocks an offer, unsupported offers escalate, and current response regeneration rechecks versions',async()=>{
 const [a]=await accounts(),p=pool(),boss=queue(p),w=new Workspace(p,a.seller_id);await boss.start();try{
 const t=await trade(w);await policy(w,t.inv,1,800);
 const ev={...synthetic({source:a.source,epoch:a.epoch},null as unknown as number,t.item,'buyer-a','offer RM9.00'),kind:'offer' as const};const src=await intake(p,boss,a.tenant,ev);await tx(p,c=>offer(c,w.seller,src.id,{...ev,position:1},t.conv));
 const d=(await p.query("SELECT * FROM trading.drafts WHERE seller_id=$1 AND item_id=$2 AND kind='offer'",[w.seller,t.item])).rows[0];
 const primary=id();await tx(p,c=>allocate(c,w.seller,{id:primary,item:t.item,buyer:'buyer-b',conversation:t.convB,quantity:1,position:2,kind:'claim'}));assert.equal(await approve(w,d.id,1),'stale');assert.equal((await w.get('inventory',t.inv)).reserved,1);
 assert.equal(await tx(p,c=>offer(c,w.seller,src.id,{...ev,text:'offer RM9.00 if free postage',position:1},t.conv)),'review');
 const ack=(await p.query("SELECT * FROM trading.drafts WHERE seller_id=$1 AND order_id=$2 AND kind='claim'",[w.seller,primary])).rows[0];await listing(w,'Updated listing',t.post,1);assert.equal(await approve(w,ack.id,1),'stale');
 const fresh=await regenerate(w,ack.id,2,'Seller checked current agreement');assert.equal(await approve(w,fresh,1),'delivered');assert.equal((await w.get('inventory',t.inv)).reserved,1);
 }finally{await boss.stop();await p.end();}
});
