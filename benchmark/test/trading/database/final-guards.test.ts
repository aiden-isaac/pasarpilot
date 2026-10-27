import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accounts,id,trade,payable } from './helpers.js';
import { pool,queue,tx } from '../../../src/trading/db.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { synthetic,intake } from '../../../src/trading/intake.js';
import { processStream } from '../../../src/trading/consumer.js';
import { handle,allocate,promote } from '../../../src/trading/stock.js';
import { approve } from '../../../src/trading/proposals.js';
import { confirmPayment,terms } from '../../../src/trading/payments.js';
import { inventory } from '../../../src/trading/catalog.js';
test('lazy expiry permits a fresh same-buyer claim and current availability is checked before delivery',async()=>{
 const [,a]=await accounts(),p=pool(),b=queue(p),w=new Workspace(p,a.seller_id);await b.start();try{
 const t=await trade(w);let n=Number((await p.query('SELECT COALESCE(max(position),0) AS n FROM trading.inbox WHERE seller_id=$1 AND source=$2 AND epoch=$3',[w.seller,a.source,a.epoch])).rows[0].n);
 const send=async(item:string,text:string,extra:object={})=>{const ev={...synthetic({source:a.source,epoch:a.epoch},++n,item,'buyer-a',text),...extra};const r=await intake(p,b,a.tenant,ev);await processStream(p,w.seller,a.source,a.epoch,handle);return r.id;};
 const first=await send(t.item,'claim');await p.query("UPDATE trading.reservations SET expires_at=now()-interval '1 second' WHERE seller_id=$1 AND id=$2",[w.seller,first]);const second=await send(t.item,'claim');
 assert.equal((await w.get('orders',first)).state,'expired');assert.equal((await w.get('orders',second)).state,'awaiting_payment');assert.equal((await w.get('inventory',t.inv)).reserved,1);
 await send(t.item,'Synthetic buyer says paid; receipt reference DEMO-RECEIPT',{kind:'payment_evidence'});assert.equal((await w.get('orders',second)).payment,'unverified');assert.equal((await w.get('reservations',second)).state,'held');
 const other=await trade(w),inquiry=await send(other.item,'Is it available?');const d=(await p.query("SELECT * FROM trading.drafts WHERE seller_id=$1 AND source_id=$2 AND kind='availability'",[w.seller,inquiry])).rows[0];assert.ok(d);
 await tx(p,c=>allocate(c,w.seller,{id:id(),item:other.item,buyer:'buyer-b',conversation:other.convB,quantity:1,position:1,kind:'claim'}));assert.equal(await approve(w,d.id,1),'stale');
 const before=(await p.query("SELECT count(*) FROM trading.drafts WHERE seller_id=$1 AND kind='offer'",[w.seller])).rows[0].count;
 await send(t.item,'question',{kind:'message',thread:'ambiguous-'+t.item});await send(other.item,'offer RM10.00',{kind:'offer',thread:'ambiguous-'+t.item});
 assert.equal((await p.query("SELECT count(*) FROM trading.drafts WHERE seller_id=$1 AND kind='offer'",[w.seller])).rows[0].count,before);
 }finally{await b.stop();await p.end();}
});
test('sold-out arrivals are terminal after restock, fee snapshots persist, and the database rejects unknown-fee totals',async()=>{
 const [a]=await accounts(),p=pool(),w=new Workspace(p,a.seller_id);try{
 const t=await payable(w);await assert.rejects(p.query('UPDATE trading.orders SET fee=NULL,total=1000 WHERE seller_id=$1 AND id=$2',[w.seller,t.order]));
 await terms(w,t.order,2,'postage',500);const order=await w.get('orders',t.order);assert.equal(order.agreement.fee,500);assert.equal(order.agreement.previous.fee,0);
 const sold=await payable(w);await confirmPayment(w,sold.order,2,1000,true);const backup=id();assert.equal(await tx(p,c=>allocate(c,w.seller,{id:backup,item:sold.item,buyer:'buyer-b',conversation:sold.convB,quantity:1,position:2,kind:'claim'})),'unfulfilled');
 const inv=await w.get('inventory',sold.inv);await inventory(w,{name:inv.name,printing:inv.printing,collector:inv.collector,language:inv.language,finish:inv.finish,condition:inv.condition,price:inv.price,unsold:1},sold.inv,inv.version);
 assert.equal(await tx(p,c=>promote(c,w.seller,sold.item)),undefined);assert.equal((await w.get('claims',backup)).state,'unfulfilled');
 }finally{await p.end();}
});
