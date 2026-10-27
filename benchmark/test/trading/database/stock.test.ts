import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accounts,id,trade } from './helpers.js';
import { pool,tx } from '../../../src/trading/db.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { item,listing } from '../../../src/trading/catalog.js';
import { allocate } from '../../../src/trading/stock.js';
test('independent connections cannot oversell shared last unit and allocation rollback is complete',async()=>{
 const [a]=await accounts(),p=pool(),q=pool(),w=new Workspace(p,a.seller_id);try{
 const t=await trade(w),other=await item(w,await listing(w,'Second WTS'),t.inv,1);
 const req={id:id(),item:t.item,buyer:'buyer-a',conversation:t.conv,quantity:1,position:1,kind:'claim' as const};
 await assert.rejects(tx(p,async c=>{await allocate(c,w.seller,req);throw Error('injected-after-stock');}),/injected/);
 assert.equal((await w.get('inventory',t.inv)).reserved,0);await assert.rejects(w.get('orders',req.id));
 const results=await Promise.all([tx(p,c=>allocate(c,w.seller,req)),tx(q,c=>allocate(c,w.seller,{...req,id:id(),item:other,buyer:'buyer-b',conversation:t.convB,position:2}))]);
 assert.deepEqual(results.sort(),['backup','primary']);assert.equal((await w.get('inventory',t.inv)).reserved,1);
 const two=await trade(w);assert.equal(await tx(p,c=>allocate(c,w.seller,{...req,id:id(),item:two.item,conversation:two.conv,quantity:2})),'backup');
 assert.equal((await w.get('inventory',two.inv)).reserved,0);
 }finally{await p.end();await q.end();}
});
