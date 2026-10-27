import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accounts,payable } from './helpers.js';
import { pool } from '../../../src/trading/db.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { confirmPayment,terms,paymentDraft } from '../../../src/trading/payments.js';
import { approve } from '../../../src/trading/proposals.js';
import { arrange,fulfil,complete } from '../../../src/trading/fulfilment.js';
test('completion needs verified payment and actual collection; repeated completion never decrements again',async()=>{
 const [a]=await accounts(),p=pool(),w=new Workspace(p,a.seller_id);try{
 const t=await payable(w);await assert.rejects(complete(w,t.order,2));await assert.rejects(fulfil(w,t.order,2,'collected','Buyer collected'));
 await confirmPayment(w,t.order,2,1000,true);await assert.rejects(complete(w,t.order,3));
 await arrange(w,t.order,3,{location:'Synthetic game shop',time:new Date().toISOString()});await fulfil(w,t.order,4,'collected','Seller handed card to synthetic buyer');
 assert.equal(await complete(w,t.order,5),'completed');assert.equal(await complete(w,t.order,5),'completed');assert.equal((await w.get('inventory',t.inv)).unsold,0);
 }finally{await p.end();}
});
test('postage and shop drop-off preserve intermediate states',async()=>{
 const [a]=await accounts(),p=pool(),w=new Workspace(p,a.seller_id);try{
 for(const method of ['postage','drop_off'] as const){const t=await payable(w);await terms(w,t.order,2,method,method==='postage'?500:0);await approve(w,await paymentDraft(w,t.order,3),1);await confirmPayment(w,t.order,3,method==='postage'?1500:1000,true);
 await arrange(w,t.order,4,method==='postage'?{recipient:'Synthetic Buyer',address:'DEMO ADDRESS',tracking:'DEMO-TRACK'}:{location:'Synthetic shop',time:new Date().toISOString()});
 await fulfil(w,t.order,5,method==='postage'?'posted':'dropped_off','Synthetic dispatch');await assert.rejects(complete(w,t.order,6));
 await fulfil(w,t.order,6,method==='postage'?'delivered':'collected','Seller confirmed actual receipt');await complete(w,t.order,7);
 }
 }finally{await p.end();}
});
