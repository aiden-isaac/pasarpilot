import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pool, checkSchema } from '../../../src/trading/db.js';
import { migrate } from '../../../src/trading/migrate.js';
test('versioned schema is non-destructive and runtime cannot change schema or audit', async () => {
 const admin=pool('fixture'), runtime=pool();
 try { await migrate(admin); await migrate(admin); await checkSchema(runtime);
 assert.equal((await runtime.query('SELECT rolsuper FROM pg_roles WHERE rolname=current_user')).rows[0].rolsuper,false);
 await assert.rejects(runtime.query('CREATE TABLE trading.forbidden(id int)'));
 await assert.rejects(runtime.query('DELETE FROM trading.activity'));
 } finally { await runtime.end(); await admin.end(); }
});
