import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accounts,id } from './helpers.js';
import { pool } from '../../../src/trading/db.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { listing,item,inventory } from '../../../src/trading/catalog.js';

test('bounded inventory/item search selects, maps, edits and opens records beyond 200 without full collection reads',async()=>{
 const [a,b]=await accounts(),p=pool(),w=new Workspace(p,a.seller_id),other=new Workspace(p,b.seller_id),prefix=id();
 try {
  await p.query(`INSERT INTO trading.inventory(seller_id,id,name,printing,collector,language,finish,condition,unsold,price)
   SELECT $1,$2||lpad(g::text,3,'0'),$2||' card '||g,'SYN','1','English','nonfoil','NM',1,1000 FROM generate_series(1,235) g`,[w.seller,prefix]);
  let cursor:string|undefined;const ids:string[]=[];
  do{const page=await w.select('inventory',prefix,{cursor});assert.ok(page.rows.length<=25);ids.push(...page.rows.map(r=>r.id));cursor=page.next;}while(cursor);
  assert.equal(ids.length,235);const last=ids.at(-1)!;assert.equal(last,prefix+'235');
  const found=await w.select('inventory',prefix+' card 235');assert.equal(found.rows[0]!.id,last);
  const post=await listing(w,'Synthetic late-page listing');const mapped=await item(w,post,last,1);
  const card=await w.get('inventory',last);await inventory(w,{name:prefix+' edited',printing:card.printing,collector:card.collector,language:card.language,finish:card.finish,condition:card.condition,unsold:card.unsold,price:card.price},last,card.version);
  assert.equal((await w.get('inventory',last)).name,prefix+' edited');
  const selected=await w.select('items',prefix+' edited',{listing:post});assert.equal(selected.rows[0]!.id,mapped);
  assert.equal((await w.get('items',mapped)).inventory_id,last);
  assert.equal((await other.select('inventory',prefix)).rows.length,0);
  await assert.rejects(other.select('items','',{listing:post}),/not-found/);
  const first=await w.select('inventory',prefix);assert.ok(first.next);
  await assert.rejects(w.select('inventory','different',{cursor:first.next}),/invalid-cursor/);
  await assert.rejects(w.select('inventory','x'.repeat(101)),/invalid-search/);
  await assert.rejects(w.select('items','\u0000'),/invalid-search/);
 }finally{await p.end();}
});
