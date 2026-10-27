import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accounts,id,trade } from './helpers.js';
import { pool,tx } from '../../../src/trading/db.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { allocate,release,sweep,extend } from '../../../src/trading/stock.js';
test('database-time expiry and repeated cancellation release once and promote backup; extension cannot resurrect',async()=>{
 const [a]=await accounts(),p=pool(),q=pool(),w=new Workspace(p,a.seller_id);try{
 const t=await trade(w),first=id(),second=id();const req={id:first,item:t.item,buyer:'buyer-a',conversation:t.conv,quantity:1,position:1,kind:'claim' as const};
 await tx(p,c=>allocate(c,w.seller,req));await tx(p,c=>allocate(c,w.seller,{...req,id:second,buyer:'buyer-b',conversation:t.convB,position:2}));
 await p.query("UPDATE trading.reservations SET expires_at=now()-interval '1 second' WHERE seller_id=$1 AND id=$2",[w.seller,first]);
 await Promise.all([sweep(w),tx(q,c=>release(c,w.seller,first,'cancelled',1))]);
 await sweep(w);assert.equal((await w.get('orders',first)).state,'expired');assert.equal((await w.get('orders',second)).state,'awaiting_payment');assert.equal((await w.get('inventory',t.inv)).reserved,1);
 await assert.rejects(extend(w,first,1,new Date(Date.now()+10000).toISOString(),'late'));
 await assert.rejects(extend(w,second,1,new Date(Date.now()+25*3600000).toISOString(),'too long'));
 await tx(p,c=>release(c,w.seller,second,'cancelled',1));await tx(p,c=>release(c,w.seller,second,'cancelled',1));assert.equal((await w.get('inventory',t.inv)).reserved,0);
 }finally{await p.end();await q.end();}
});
