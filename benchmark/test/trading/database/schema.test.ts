import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pool, checkSchema,queue } from '../../../src/trading/db.js';
import { migrate } from '../../../src/trading/migrate.js';
import { SchedulerStore } from '../../../src/scheduler-store.js';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('versioned schema is non-destructive and runtime cannot change schema or audit', async () => {
 const admin=pool('fixture'), runtime=pool();
 const root=mkdtempSync(join(tmpdir(),'seller-role-'));let scheduler:SchedulerStore|undefined;
 try { await migrate(admin); await migrate(admin); await checkSchema(runtime);
 assert.equal(runtime.options.user,'trading_runtime');
 const role=(await runtime.query('SELECT current_user,rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user')).rows[0];
 assert.equal(role.current_user,'trading_runtime');assert.equal(role.rolsuper,false);assert.equal(role.rolcreatedb,false);assert.equal(role.rolcreaterole,false);
 scheduler=await SchedulerStore.open(root,true);
 for(const sql of ['CREATE TABLE trading.forbidden(id int)',`CREATE TABLE ${scheduler.schema}.forbidden(id int)`,
  `ALTER TABLE ${scheduler.schema}.schedule ADD COLUMN forbidden int`,'ALTER TABLE trading.sellers ADD COLUMN forbidden int',
  'INSERT INTO trading.migrations(version) VALUES(999)','UPDATE trading.migrations SET version=999','DELETE FROM trading.migrations',
  "UPDATE trading.activity SET reason='forbidden'",'DELETE FROM trading.activity'])await assert.rejects(runtime.query(sql),{code:'42501'});
 const b=queue(runtime);try{await b.start();const id=await b.send('inbox',{roleProbe:true});assert.ok(id);await b.cancel('inbox',id);await b.maintain();}finally{await b.stop();}
 await checkSchema(runtime);
 } finally {
  if(scheduler){await scheduler.close();await admin.query(`DROP SCHEMA ${scheduler.schema} CASCADE; DROP SCHEMA ${scheduler.queueSchema} CASCADE`);}
  rmSync(root,{recursive:true});await runtime.end(); await admin.end();
 }
});
