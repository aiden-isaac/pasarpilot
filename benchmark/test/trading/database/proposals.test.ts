import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accounts,id,trade } from './helpers.js';
import { pool,tx } from '../../../src/trading/db.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { allocate } from '../../../src/trading/stock.js';
import { approve } from '../../../src/trading/proposals.js';
import { listing } from '../../../src/trading/catalog.js';
test('approval delivers once and stale listing dependency delivers nothing',async()=>{
 const [a]=await accounts(),p=pool(),w=new Workspace(p,a.seller_id);try{
 const t=await trade(w);await tx(p,c=>allocate(c,w.seller,{id:id(),item:t.item,buyer:'buyer-a',conversation:t.conv,quantity:1,position:1,kind:'claim'}));
 const d=(await p.query('SELECT * FROM trading.drafts WHERE seller_id=$1 AND item_id=$2',[w.seller,t.item])).rows[0];
 assert.equal(await approve(w,d.id,1),'delivered');assert.equal(await approve(w,d.id,1),'delivered');
 assert.equal((await p.query('SELECT 1 FROM trading.deliveries WHERE seller_id=$1 AND id=$2',[w.seller,d.id])).rowCount,1);
 const x=await trade(w);await tx(p,c=>allocate(c,w.seller,{id:id(),item:x.item,buyer:'buyer-a',conversation:x.conv,quantity:1,position:1,kind:'claim'}));
 const stale=(await p.query('SELECT * FROM trading.drafts WHERE seller_id=$1 AND item_id=$2',[w.seller,x.item])).rows[0];await listing(w,'Edited WTS',x.post,1);
 assert.equal(await approve(w,stale.id,1),'stale');assert.equal((await p.query('SELECT 1 FROM trading.deliveries WHERE seller_id=$1 AND id=$2',[w.seller,stale.id])).rowCount,0);
 }finally{await p.end();}
});
