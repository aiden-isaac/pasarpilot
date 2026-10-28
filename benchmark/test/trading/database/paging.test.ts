import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accounts,id,trade } from './helpers.js';
import { pool } from '../../../src/trading/db.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { history } from '../../../src/trading/history.js';
import type { Page } from '../../../src/trading/paging.js';

test('keyset pages traverse all rows, retain timestamp precision and reject incompatible cursors and filters',async()=>{
 const [a,b]=await accounts(),p=pool(),w=new Workspace(p,a.seller_id),other=new Workspace(p,b.seller_id),prefix=id();
 try {
  for(const seller of [w.seller,other.seller])await p.query(`INSERT INTO trading.inventory(seller_id,id,name,printing,collector,language,finish,condition,unsold,price)
   SELECT $1,$2||g,'Paging card','SYN','1','English','nonfoil','NM',1,1000 FROM generate_series(1,235) g`,[seller,prefix]);
  const walk=async(read:(cursor?:string)=>Promise<Page>)=>{
   const ids:string[]=[];let cursor:string|undefined;
   do{const page=await read(cursor);assert.ok(page.rows.length<=25);ids.push(...page.rows.map(r=>String(r.id)));cursor=page.next;}while(cursor);
   assert.equal(new Set(ids).size,ids.length);return ids;
  };
  const actual=await walk(cursor=>w.page('inventory',{cursor}));
  assert.deepEqual(actual,(await p.query('SELECT id FROM trading.inventory WHERE seller_id=$1 ORDER BY id',[w.seller])).rows.map(r=>r.id));
  assert.ok(actual.includes(prefix+'235'));
  const first=await w.page('inventory');assert.equal(first.rows.length,25);assert.ok(first.next);
  await assert.rejects(other.page('inventory',{cursor:first.next}),/invalid-cursor/);
  assert.equal((await other.get('inventory',prefix+'235')).name,'Paging card');
  const t=await trade(w);
  await p.query(`INSERT INTO trading.claims(seller_id,id,item_id,buyer,conversation_id,quantity,position,state)
   SELECT $1,$2||g,$3,'buyer-a',$4,1,g,'expired' FROM generate_series(1,235) g`,[w.seller,prefix,t.item,t.conv]);
  await p.query(`INSERT INTO trading.orders(seller_id,id,claim_id,item_id,buyer,conversation_id,quantity,unit_price,agreement,state,created_at)
   SELECT $1,$2||g,$2||g,$3,'buyer-a',$4,1,1000,'{}',CASE WHEN g%2=0 THEN 'cancelled' ELSE 'expired' END,
    '2020-01-01T00:00:00Z'::timestamptz+(g/2)*interval '1 microsecond' FROM generate_series(1,235) g`,[w.seller,prefix,t.item,t.conv]);
  const ordered=await walk(cursor=>history(w,'expired','buyer-a',{cursor}));
  assert.deepEqual(ordered,(await p.query("SELECT id FROM trading.orders WHERE seller_id=$1 AND state='expired' AND buyer='buyer-a' ORDER BY created_at DESC,id DESC",[w.seller])).rows.map(r=>r.id));
  const h=await history(w,'expired','buyer-a');assert.ok(h.next);
  await assert.rejects(history(w,'cancelled','buyer-a',{cursor:h.next}),/invalid-cursor/);
  for(const cursor of ['',"' OR true--",'x'.repeat(2049),Buffer.from('{}').toString('base64url')])await assert.rejects(w.page('orders',{cursor}),/invalid-cursor/);
  for(const limit of [0,101,1.5,NaN])await assert.rejects(w.page('inventory',{limit}),/invalid-page-size/);
  await assert.rejects(w.page('orders',{state:'unknown'}),/invalid-state/);
  await assert.rejects(w.page('inventory',{state:'paid'}),/invalid-state/);
  await assert.rejects(w.page('orders',{buyer:'x'.repeat(201)}),/invalid-text/);
  await assert.rejects(w.page('orders',{open:'true'}),/invalid-open/);
  await assert.rejects(w.page('reviews',{resolved:'yes'}),/invalid-review/);
  assert.ok((await w.page('inventory',{limit:100})).rows.length<=100);
 }finally{await p.end();}
});
