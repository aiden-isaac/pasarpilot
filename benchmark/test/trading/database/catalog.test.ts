import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accounts,id } from './helpers.js';
import { pool } from '../../../src/trading/db.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { inventory,type Card } from '../../../src/trading/catalog.js';
import { trade } from './helpers.js';
import { tx } from '../../../src/trading/db.js';
import { allocate } from '../../../src/trading/stock.js';
export const card:Card={name:'Synthetic Lightning Bolt',printing:'SYN',collector:'1',language:'English',finish:'nonfoil',condition:'NM',unsold:1,price:1000};
test('variants are separate, stale edits and reductions consuming holds fail atomically',async()=>{
 const [a]=await accounts(),p=pool(),w=new Workspace(p,a.seller_id);try {
 const key=await inventory(w,card,id()),foil=await inventory(w,{...card,finish:'foil'},id());
 await p.query('UPDATE trading.inventory SET reserved=1 WHERE seller_id=$1 AND id=$2',[w.seller,key]);
 await assert.rejects(inventory(w,{...card,unsold:0},key,1),/held/);
 await assert.rejects(inventory(w,card,key,2),/stale/);assert.equal((await w.get('inventory',foil)).reserved,0);
 assert.equal((await w.get('inventory',key)).unsold,1);
 const real=await trade(w);await tx(p,c=>allocate(c,w.seller,{id:id(),item:real.item,buyer:'buyer-a',conversation:real.conv,quantity:1,position:1,kind:'claim'}));
 const held=await w.get('inventory',real.inv),before=(await p.query('SELECT count(*)::int n FROM trading.activity WHERE seller_id=$1 AND record_id=$2',[w.seller,real.inv])).rows[0].n;
 await assert.rejects(inventory(w,{...card,unsold:0},real.inv,held.version),/held/);assert.equal((await w.get('inventory',real.inv)).reserved,1);assert.equal((await w.get('inventory',real.inv)).version,held.version);assert.equal((await p.query('SELECT count(*)::int n FROM trading.activity WHERE seller_id=$1 AND record_id=$2',[w.seller,real.inv])).rows[0].n,before);
 }finally{await p.end();}
});
