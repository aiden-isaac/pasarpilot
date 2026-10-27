import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { pool } from '../../../src/trading/db.js';
import { migrate } from '../../../src/trading/migrate.js';
import { seed } from '../../../src/trading/setup.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { onboarding } from '../../../src/trading/onboarding.js';
import { profile } from '../../../src/trading/profile.js';
import { instructions } from '../../../src/trading/payments.js';
import { inventory,listing,item } from '../../../src/trading/catalog.js';
test('first-use facts resume out of order without duplicate records or implicit approvals',async()=>{
 const admin=pool('fixture'),database=`onboarding_${process.pid}`;await admin.query(`CREATE DATABASE ${database}`);
 let p=new pg.Pool({host:process.env.PGHOST,user:'fixture',database});
 try{
  await migrate(p);const [a,b]=await seed(p,[randomBytes(24).toString('hex'),randomBytes(24).toString('hex')]);let w=new Workspace(p,a!);
  const progress=async()=> (await onboarding(w)).filter(s=>s.done).length;
  assert.equal(await progress(),1);await profile(w,1,'Synthetic invited seller');assert.equal(await progress(),2);
  await instructions(w,1,'DEMO ONLY synthetic instructions',false);assert.equal(await progress(),2);
  await instructions(w,2,'DEMO ONLY synthetic instructions',true);assert.equal(await progress(),3);
  const post=await listing(w,'Synthetic WTS');assert.equal(await progress(),4);
  await p.end();p=new pg.Pool({host:process.env.PGHOST,user:'fixture',database});w=new Workspace(p,a!);assert.equal(await progress(),4);
  assert.equal((await onboarding(new Workspace(p,b!))).filter(s=>s.done).length,1);
  const inv=await inventory(w,{name:'Synthetic Bolt',printing:'SYN',collector:'1',language:'English',finish:'nonfoil',condition:'NM',unsold:1,price:1000});assert.equal(await progress(),5);
  await item(w,post,inv,1);assert.equal(await progress(),6);assert.equal(await progress(),6);
  assert.equal((await w.get('inventory',inv)).minimum,null);
  for(const table of ['inventory','listings','items'])assert.equal((await p.query(`SELECT count(*)::int n FROM trading.${table} WHERE seller_id=$1`,[a])).rows[0].n,1);
  for(const table of ['orders','deliveries'])assert.equal((await p.query(`SELECT count(*)::int n FROM trading.${table}`)).rows[0].n,0);
 }finally{await p.end();await admin.query(`DROP DATABASE ${database}`);await admin.end();}
});
