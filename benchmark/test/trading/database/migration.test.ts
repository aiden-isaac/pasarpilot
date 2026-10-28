import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { pool,checkSchema } from '../../../src/trading/db.js';
import { migrate } from '../../../src/trading/migrate.js';
import { seed } from '../../../src/trading/setup.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { payable } from './helpers.js';
import { confirmPayment } from '../../../src/trading/payments.js';
import { arrange,fulfil,complete } from '../../../src/trading/fulfilment.js';

test('fresh schema and v1/v2 upgrades retain accounts, sources, sessions and held/paid/completed records',async()=>{
 const admin=pool('fixture');
 try { for(const legacy of [1,2]) {
  // Only these newly created disposable databases are reshaped to the legacy schema.
  const name=`migration_${process.pid}_${legacy}`;
  await admin.query(`CREATE DATABASE ${name}`);
  const p=new pg.Pool({host:process.env.PGHOST,user:'fixture',database:name,max:3});
  try {
   await migrate(p);await checkSchema(p);
   const [seller]=await seed(p,[randomBytes(24).toString('hex'),randomBytes(24).toString('hex')]);
   const w=new Workspace(p,seller!);
   const held=await payable(w),paid=await payable(w),done=await payable(w);
   await confirmPayment(w,paid.order,2,1000,true);
   await confirmPayment(w,done.order,2,1000,true);
   await arrange(w,done.order,3,{location:'Synthetic shop',time:new Date().toISOString()});
   await fulfil(w,done.order,4,'collected','Synthetic handover');await complete(w,done.order,5);
   await p.query("INSERT INTO trading.sessions VALUES('synthetic-hash',$1,'synthetic-csrf',now()+interval '1 hour',false)",[seller]);
   await p.query("UPDATE trading.activity SET created_at='2020-01-02T03:04:05Z' WHERE seller_id=$1 AND record_id=$2",[seller,paid.order]);
   await p.query('DELETE FROM trading.activity WHERE seller_id=$1 AND record_id=$2',[seller,held.order]);
   const snapshot=async()=>({
    sellers:(await p.query('SELECT id,login,password_hash,instructions,instructions_approved,instruction_version FROM trading.sellers ORDER BY id')).rows,
    sources:(await p.query('SELECT * FROM trading.sources ORDER BY tenant')).rows,
    sessions:(await p.query('SELECT * FROM trading.sessions ORDER BY hash')).rows,
    stock:(await p.query('SELECT * FROM trading.inventory ORDER BY id')).rows,
    orders:(await p.query('SELECT id,state,payment,fulfilment,agreement,version FROM trading.orders ORDER BY id')).rows,
    holds:(await p.query('SELECT * FROM trading.reservations ORDER BY id')).rows
   });
   const before=await snapshot();
   await p.query(`ALTER TABLE trading.sellers DROP COLUMN display_name,DROP COLUMN profile_version;
    ALTER TABLE trading.orders DROP COLUMN created_at;
    DELETE FROM trading.migrations WHERE version>2;`);
   if(legacy===1)await p.query('ALTER TABLE trading.orders DROP CONSTRAINT known_total; DELETE FROM trading.migrations WHERE version=2');
   const start=Date.now();await migrate(p);await migrate(p);await checkSchema(p);
   assert.deepEqual(await snapshot(),before);
   for(const s of (await p.query('SELECT * FROM trading.sellers')).rows){assert.equal(s.display_name,s.login);assert.equal(s.profile_version,1);}
   assert.equal((await w.get('orders',paid.order)).created_at.toISOString(),'2020-01-02T03:04:05.000Z');
   assert.ok((await w.get('orders',held.order)).created_at.getTime()>=start-1000);
   await assert.rejects(p.query("UPDATE trading.sellers SET display_name=''"),/bounded_display_name/);
   await assert.rejects(p.query("UPDATE trading.sellers SET display_name=repeat('x',81)"),/bounded_display_name/);
   await assert.rejects(p.query('UPDATE trading.sellers SET profile_version=0'),/check constraint/);
  } finally {await p.end();await admin.query(`DROP DATABASE ${name}`);}
 }} finally {await admin.end();}
});
