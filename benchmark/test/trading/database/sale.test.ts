import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accounts,trade } from './helpers.js';
import { pool,queue } from '../../../src/trading/db.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { intake,synthetic } from '../../../src/trading/intake.js';
import { processStream } from '../../../src/trading/consumer.js';
import { handle } from '../../../src/trading/stock.js';
import { instructions,terms,paymentDraft,confirmPayment } from '../../../src/trading/payments.js';
import { approve } from '../../../src/trading/proposals.js';
import { arrange,fulfil,complete } from '../../../src/trading/fulfilment.js';
import { timeline } from '../../../src/trading/history.js';
test('browser-free normalized RM10 sale completes A once and never sells backup B',async()=>{
 const [a]=await accounts(),p=pool(),b=queue(p),w=new Workspace(p,a.seller_id);await b.start();try{
 const t=await trade(w),n=Number((await p.query('SELECT COALESCE(max(position),0) AS n FROM trading.inbox WHERE seller_id=$1 AND source=$2 AND epoch=$3',[w.seller,a.source,a.epoch])).rows[0].n);
 const first=synthetic({source:a.source,epoch:a.epoch},n+1,t.item),second=synthetic({source:a.source,epoch:a.epoch},n+2,t.item,'buyer-b');
 const two=await intake(p,b,a.tenant,second);await processStream(p,w.seller,a.source,a.epoch,handle);assert.equal((await w.get('inventory',t.inv)).reserved,0);
 const one=await intake(p,b,a.tenant,first);await processStream(p,w.seller,a.source,a.epoch,handle);assert.equal((await w.get('claims',two.id)).state,'backup');assert.equal((await w.get('inventory',t.inv)).reserved,1);
 const v=(await p.query('SELECT instruction_version FROM trading.sellers WHERE id=$1',[w.seller])).rows[0].instruction_version;await instructions(w,v,'DEMO ONLY synthetic account',true);await terms(w,one.id,1,'collection',0);await approve(w,await paymentDraft(w,one.id,2),1);await confirmPayment(w,one.id,2,1000,true);
 await arrange(w,one.id,3,{location:'Synthetic game shop',time:new Date().toISOString()});await fulfil(w,one.id,4,'collected','Seller confirmed actual collection');await complete(w,one.id,5);
 const count=(await timeline(w,one.id)).rows.length;await intake(p,b,a.tenant,first);await processStream(p,w.seller,a.source,a.epoch,handle);await confirmPayment(w,one.id,2,1000,true);await complete(w,one.id,5);assert.equal((await timeline(w,one.id)).rows.length,count);
 assert.equal((await w.get('orders',one.id)).state,'completed');assert.equal((await w.get('claims',two.id)).state,'unfulfilled');assert.equal((await w.get('inventory',t.inv)).unsold,0);assert.equal((await w.get('inventory',t.inv)).reserved,0);
 }finally{await b.stop();await p.end();}
});
