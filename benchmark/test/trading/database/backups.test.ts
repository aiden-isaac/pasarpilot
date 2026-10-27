import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accounts,id,trade } from './helpers.js';
import { pool,tx } from '../../../src/trading/db.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { allocate,promote } from '../../../src/trading/stock.js';
test('backup promotion chooses full quantity fit in source order and never allocates again',async()=>{
 const [a]=await accounts(),p=pool(),w=new Workspace(p,a.seller_id);try{
 const t=await trade(w),base={item:t.item,buyer:'buyer-a',conversation:t.conv,quantity:2,position:1,kind:'backup' as const};
 const big=id(),fit=id();await tx(p,c=>allocate(c,w.seller,{...base,id:big}));await tx(p,c=>allocate(c,w.seller,{...base,id:fit,quantity:1,buyer:'buyer-b',conversation:t.convB,position:2}));
 assert.equal(await tx(p,c=>promote(c,w.seller,t.item)),'primary');assert.equal((await w.get('claims',big)).state,'backup');
 assert.equal((await w.get('claims',fit)).state,'primary');assert.equal(await tx(p,c=>promote(c,w.seller,t.item)),undefined);
 assert.equal((await w.get('inventory',t.inv)).reserved,1);
 }finally{await p.end();}
});
