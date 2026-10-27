import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accounts,id,trade } from './helpers.js';
import { pool,tx,queue } from '../../../src/trading/db.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { synthetic,intake } from '../../../src/trading/intake.js';
import { review } from '../../../src/trading/consumer.js';
import { allocate } from '../../../src/trading/stock.js';
import { resolve } from '../../../src/trading/reviews.js';
test('review uses current capacity cannot displace a hold and rejects stale or foreign actions',async()=>{
 const [a,b]=await accounts(),p=pool(),boss=queue(p),w=new Workspace(p,a.seller_id);await boss.start();try{
 const t=await trade(w);await tx(p,c=>allocate(c,w.seller,{id:id(),item:t.item,buyer:'buyer-a',conversation:t.conv,quantity:1,position:1,kind:'claim'}));
 const ev=synthetic({source:a.source,epoch:a.epoch},null as unknown as number,t.item,'buyer-b','claim if nice');const src=await intake(p,boss,a.tenant,ev);
 const r=await tx(p,c=>review(c,w.seller,src.id,'ambiguous synthetic claim'));
 await assert.rejects(resolve(new Workspace(p,b.seller_id),r,1,'claim',t.item,'buyer-b',1,'reviewed'),/not-found/);
 assert.equal(await resolve(w,r,1,'claim',t.item,'buyer-b',1,'Buyer clarified'),'backup');
 await assert.rejects(resolve(w,r,1,'claim',t.item,'buyer-b',1,'duplicate'),/stale/);assert.equal((await w.get('inventory',t.inv)).reserved,1);
 }finally{await boss.stop();await p.end();}
});
