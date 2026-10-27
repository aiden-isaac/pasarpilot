import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accounts,id,trade } from './helpers.js';
import { pool,tx,queue } from '../../../src/trading/db.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { policy,offer } from '../../../src/trading/negotiation.js';
import { approve } from '../../../src/trading/proposals.js';
import { synthetic,intake } from '../../../src/trading/intake.js';
import { allocate } from '../../../src/trading/stock.js';
test('offers respect private floor and changing policy; approved acceptance reuses existing hold',async()=>{
 const [a]=await accounts(),p=pool(),boss=queue(p),w=new Workspace(p,a.seller_id);await boss.start();try{
 const t=await trade(w);await policy(w,t.inv,1,800);
 const make=async(amount:string)=>{const ev={...synthetic({source:a.source,epoch:a.epoch},null as unknown as number,t.item,'buyer-a',amount),kind:'offer' as const,position:null}; const r=await intake(p,boss,a.tenant,ev);return tx(p,c=>offer(c,w.seller,r.id,{...ev,position:1},t.conv));};
 assert.equal(await make('offer RM7.00'),'counter_proposed');const drafts=()=>p.query('SELECT * FROM trading.drafts WHERE seller_id=$1 AND item_id=$2 ORDER BY id',[w.seller,t.item]);
 assert.ok((await drafts()).rows.every(d=>!d.text.includes('8.00')));assert.equal((await w.get('inventory',t.inv)).reserved,0);
 await make('offer RM9.00');const d=(await drafts()).rows.find(d=>d.kind==='offer');await policy(w,t.inv,2,950);assert.equal(await approve(w,d.id,1),'stale');
 await policy(w,t.inv,3,800);await tx(p,c=>allocate(c,w.seller,{id:id(),item:t.item,buyer:'buyer-a',conversation:t.conv,quantity:1,position:1,kind:'claim'}));
 await make('offer RM9.00');const current=(await drafts()).rows.find(d=>d.kind==='offer'&&d.state==='proposed');assert.equal(await approve(w,current.id,1),'delivered');
 assert.equal((await w.get('inventory',t.inv)).reserved,1);assert.equal((await p.query('SELECT unit_price FROM trading.orders WHERE seller_id=$1 AND item_id=$2',[w.seller,t.item])).rows[0].unit_price,900);
 }finally{await boss.stop();await p.end();}
});
