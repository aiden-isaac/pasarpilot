import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accounts,id } from './helpers.js';
import { pool } from '../../../src/trading/db.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { startDemo,demoStep,demoIds } from '../../../src/trading/demo.js';
import { inventory } from '../../../src/trading/catalog.js';
import { view } from '../../../src/trading/dashboard.js';
test('guided runs create explicit RM10 units, replay steps safely and preserve previous records',async()=>{
 const [a,b]=await accounts(),p=pool(),w=new Workspace(p,a.seller_id),run=id();
 try{
  const [ids,again]=await Promise.all([startDemo(w,run),startDemo(w,run)]);assert.deepEqual(ids,again);
  const card=await w.get('inventory',ids.inventory);assert.equal(card.price,1000);assert.equal(card.unsold,1);assert.equal(card.finish,'nonfoil');assert.equal(card.condition,'NM');
  await assert.rejects(demoStep(w,run,'backup-b'),/live-buyer-a-hold/);
  await demoStep(w,run,'claim-a');await demoStep(w,run,'backup-b');await demoStep(w,run,'claim-a');await demoStep(w,run,'backup-b');
  const claims=(await w.children('items',ids.item,'claims')).rows;assert.equal(claims.length,2);assert.deepEqual(claims.map(c=>c.state).sort(),['backup','primary']);assert.equal((await w.get('inventory',ids.inventory)).reserved,1);
  const order=(await w.children('items',ids.item,'orders')).rows[0]!;assert.equal(order.payment,'unverified');assert.equal(order.fee,null);
  const html=await view(w,'synthetic-csrf',new URL('http://127.0.0.1/?view=demo&id='+run));assert.match(html,/Continue with Buyer A order/);assert.match(html,/Backup · no stock reserved/);assert.match(html,/0.00/);
  const second=await startDemo(w,id());assert.notEqual(second.item,ids.item);assert.equal((await w.get('inventory',ids.inventory)).reserved,1);assert.equal((await w.get('orders',order.id)).payment,'unverified');
  const partial=id(),partialIds=demoIds(partial);await inventory(w,{name:'Partially prepared synthetic run',printing:'SYN',collector:'1',language:'English',finish:'nonfoil',condition:'NM',unsold:1,price:1000},partialIds.inventory);
  await startDemo(w,partial);assert.equal((await w.get('inventory',partialIds.inventory)).version,1);assert.equal((await w.get('items',partialIds.item)).inventory_id,partialIds.inventory);
  await assert.rejects(demoStep(new Workspace(p,b.seller_id),run,'claim-a'),/not-found/);await assert.rejects(startDemo(w,'invalid'),/invalid-demo-run/);
 }finally{await p.end();}
});
