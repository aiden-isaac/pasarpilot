import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accounts,id,trade } from './helpers.js';
import { pool,tx } from '../../../src/trading/db.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { allocate } from '../../../src/trading/stock.js';
import { timeline,sharedInstructions } from '../../../src/trading/history.js';
import type { Page } from '../../../src/trading/paging.js';

test('long detail children, backup positions, timeline references and instruction snapshots remain bounded and fully reachable',async()=>{
 const [a,b]=await accounts(),p=pool(),w=new Workspace(p,a.seller_id),foreign=new Workspace(p,b.seller_id),prefix=id();
 try {
  const t=await trade(w),order=id();
  await tx(p,c=>allocate(c,w.seller,{id:order,item:t.item,buyer:'buyer-a',conversation:t.conv,quantity:1,position:1,kind:'claim'}));
  await p.query(`INSERT INTO trading.claims(seller_id,id,item_id,buyer,conversation_id,quantity,position,state)
   SELECT $1,$2||g,$3,'buyer-b',$4,1,(g/2)+2,'backup' FROM generate_series(1,235) g`,[w.seller,prefix,t.item,t.convB]);
  await p.query(`INSERT INTO trading.messages(seller_id,id,conversation_id,text,direction,created_at)
   SELECT $1,$2||g,$3,'Synthetic history','in',now()+(g/2)*interval '1 microsecond' FROM generate_series(1,235) g`,[w.seller,prefix,t.conv]);
  await p.query(`INSERT INTO trading.drafts(seller_id,id,conversation_id,order_id,item_id,kind,text,dependencies,state)
   SELECT $1,$2||g,$3,$4,$5,'payment','Synthetic instructions','{}','delivered' FROM generate_series(1,235) g`,[w.seller,prefix,t.conv,order,t.item]);
  await p.query(`INSERT INTO trading.deliveries(seller_id,id,instructions) SELECT $1,$2||g,jsonb_build_object('snapshot',g) FROM generate_series(1,235) g`,[w.seller,prefix]);
  await p.query(`INSERT INTO trading.activity(seller_id,action,record_id,version,actor,reason) SELECT $1,'test_history',$2||g,1,'test','Synthetic history' FROM generate_series(1,235) g`,[w.seller,prefix]);
  const walk=async(read:(cursor?:string)=>Promise<Page>)=>{
   const rows:Record<string,any>[]=[];let cursor:string|undefined;
   do{const page=await read(cursor);assert.ok(page.rows.length<=25);rows.push(...page.rows);cursor=page.next;}while(cursor);
   assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);return rows;
  };
  const claims=await walk(cursor=>w.children('items',t.item,'claims',{cursor}));
  assert.equal(claims.length,236);assert.equal(claims[0]!.id,order);
  claims.slice(1).forEach((c,n)=>assert.equal(Number(c.backup_rank),n+1));
  assert.equal((await walk(cursor=>w.children('conversations',t.conv,'messages',{cursor}))).length,235);
  assert.equal((await walk(cursor=>w.children('orders',order,'drafts',{cursor}))).length,236);
  const snapshots=await walk(cursor=>sharedInstructions(w,order,{cursor}));
  assert.equal(snapshots.length,235);assert.ok(snapshots.some(s=>s.instructions.snapshot===235));
  const events=await walk(cursor=>timeline(w,order,{cursor}));
  assert.equal(events.filter(e=>e.action==='test_history').length,235);
  for(const read of [()=>foreign.children('items',t.item,'claims'),()=>foreign.children('orders',order,'drafts'),()=>sharedInstructions(foreign,order),()=>timeline(foreign,order)])await assert.rejects(read(),/not-found/);
  await assert.rejects(w.children('items',t.item,'sessions' as never),/invalid-detail/);
 }finally{await p.end();}
});
