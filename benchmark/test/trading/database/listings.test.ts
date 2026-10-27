import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accounts } from './helpers.js';
import { pool } from '../../../src/trading/db.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { inventory,listing,item } from '../../../src/trading/catalog.js';
const card={name:'Synthetic Bolt',printing:'SYN',collector:'1',language:'English',finish:'nonfoil',condition:'NM',unsold:1,price:1000};
test('mapped items share inventory and seller-consistent references; edits cannot reduce allocations',async()=>{
 const [a,b]=await accounts(),p=pool(),w=new Workspace(p,a.seller_id);try{
 const inv=await inventory(w,card),post=await listing(w,'WTS'),other=await listing(w,'Other'),x=await item(w,post,inv,1),y=await item(w,other,inv,1);
 assert.equal((await w.get('items',x)).inventory_id,(await w.get('items',y)).inventory_id);
 await assert.rejects(item(new Workspace(p,b.seller_id),post,inv,1),/not-found/);
 await p.query('UPDATE trading.items SET allocated=1 WHERE seller_id=$1 AND id=$2',[w.seller,x]);
 await assert.rejects(item(w,post,inv,0,x,1));await listing(w,'WTS',post,1,false);
 assert.equal((await w.get('listings',post)).open,false);assert.equal((await w.get('items',x)).allocated,1);
 }finally{await p.end();}
});
