import assert from 'node:assert/strict';
import { test } from 'node:test';
import PgBoss from 'pg-boss';
import pg from 'pg';

test('pinned queue supports transactional intent, deduplication, expiry and fenced settlement', async () => {
  assert.ok(process.env.PGHOST, 'Set PGHOST to an explicit private test database; no implicit database tests');
  const pool = new pg.Pool({ user: 'fixture', database: 'fixture', max: 2, connectionTimeoutMillis: 2000, query_timeout: 3000 });
  const schema = `proof_${process.pid}`;
  const boss = new PgBoss({ db: { executeSql: (text, values) => pool.query(text, values) }, schema, schedule: false, supervise: false });
  boss.on('error', () => undefined);
  try {
    await boss.start();
    assert.match((await pool.query('SHOW server_version')).rows[0].server_version, /^17\./);
    await boss.createQueue('proof', { name: 'proof', policy: 'short' });
    const client = await pool.connect();
    const db = { executeSql: (text: string, values: unknown[]) => client.query(text, values) };
    try {
      await client.query('BEGIN');
      const rolledBack = await boss.send('proof', { logicalId: 'rollback' }, { db });
      await client.query('ROLLBACK');
      assert.equal(await boss.getJobById('proof', rolledBack!), null);
      await client.query('BEGIN');
      const id = await boss.send('proof', { logicalId: 'durable' }, { db, singletonKey: 'observation', expireInSeconds: 180, retryLimit: 2 });
      assert.ok(id);
      assert.equal(await boss.send('proof', {}, { db, singletonKey: 'observation' }), null);
      await client.query('COMMIT');
      const [job] = await boss.fetch('proof', { includeMetadata: true });
      assert.equal(job!.id, id);
      await pool.query(`UPDATE ${schema}.job SET started_on=now()-interval '181 seconds' WHERE id=$1`, [id]);
      await boss.expire();
      const [retry] = await boss.fetch('proof', { includeMetadata: true });
      assert.equal(retry!.retryCount, 1);
      await client.query('BEGIN');
      // pg-boss 10 has no attempt-aware completion: lock and fence its pinned schema before settlement.
      const stale = await client.query(`SELECT id FROM ${schema}.job WHERE id=$1 AND state='active' AND retry_count=$2 FOR UPDATE`, [id, job!.retryCount]);
      assert.equal(stale.rowCount, 0);
      const current = await client.query(`SELECT id FROM ${schema}.job WHERE id=$1 AND state='active' AND retry_count=$2 FOR UPDATE`, [id, retry!.retryCount]);
      assert.equal(current.rowCount, 1);
      await boss.complete('proof', id!, { durable: true }, { db });
      await client.query('COMMIT');
      assert.equal((await boss.getJobById('proof', id!))!.state, 'completed');
      await boss.maintain();
    } finally { await client.query('ROLLBACK'); client.release(); }
  } finally {
    await boss.stop({ graceful: false });
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.end();
  }
});
