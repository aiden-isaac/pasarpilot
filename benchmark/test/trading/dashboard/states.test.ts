import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accounts,id,payable } from '../database/helpers.js';
import { pool,tx } from '../../../src/trading/db.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { view,mutate } from '../../../src/trading/dashboard.js';
import { allocate } from '../../../src/trading/stock.js';
import { confirmPayment,terms,paymentDraft } from '../../../src/trading/payments.js';
import { approve } from '../../../src/trading/proposals.js';
import { arrange,fulfil } from '../../../src/trading/fulfilment.js';

test('dashboard distinguishes unreserved backup, simulated instructions, evidence, verified payment and intermediate postage',async()=>{
 const [a]=await accounts(),p=pool(),w=new Workspace(p,a.seller_id);
 const render=(section:string,id:string)=>view(w,'synthetic-csrf',new URL(`http://127.0.0.1/?view=${section}&id=${id}`));
 try{
  const t=await payable(w);
  await tx(p,c=>allocate(c,w.seller,{id:id(),item:t.item,buyer:'buyer-b',conversation:t.convB,quantity:1,position:2,kind:'claim'}));
  const item=await render('items',t.item);assert.match(item,/Backup · no stock reserved/);assert.match(item,/backup position 1 · no reservation/);
  const unpaid=await render('orders',t.order);assert.match(unpaid,/Unverified · buyer evidence cannot confirm payment/);assert.match(unpaid,/Delivered to fixture \(simulated\)/);assert.match(unpaid,/MYT \(UTC\+08:00\)/);assert.match(unpaid,/Total \(MYR\): RM10.00/);
  const evidence=id();await mutate(w,'/synthetic',new URLSearchParams({event:evidence,item:t.item,buyer:'buyer-a',kind:'payment_evidence',text:'Synthetic screenshot claim only'}));
  assert.equal((await w.get('orders',t.order)).payment,'unverified');
  const review=(await p.query("SELECT r.id FROM trading.reviews r JOIN trading.inbox e ON(e.seller_id=r.seller_id AND e.id=r.source_id) WHERE r.seller_id=$1 AND e.event_id=$2 AND NOT r.resolved AND r.reason='buyer payment evidence remains unverified'",[w.seller,evidence])).rows[0];assert.ok(review);assert.match(await render('reviews',review.id),/buyer payment evidence remains unverified/);
  const post=await payable(w);await terms(w,post.order,2,'postage',0);await approve(w,await paymentDraft(w,post.order,3),1);await confirmPayment(w,post.order,3,1000,true);
  await arrange(w,post.order,4,{recipient:'Synthetic buyer',address:'Synthetic address',tracking:'SYN-1'});await fulfil(w,post.order,5,'posted','Synthetic dispatch');
  const paid=await render('orders',post.order);assert.match(paid,/Manually verified by seller/);assert.match(paid,/Paid · awaiting completion/);assert.match(paid,/Posted · awaiting buyer receipt/);assert.match(paid,/Record delivered only after actual buyer receipt/);assert.doesNotMatch(paid,/&middot; Completed/);
  assert.equal((await w.get('orders',post.order)).state,'paid');
 }finally{await p.end();}
});
