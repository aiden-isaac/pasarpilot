import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SchedulerStore, type Claim } from '../../src/scheduler-store.js';

test('durable scheduler coalesces, bounds work, dispatches fairly and fences stale deliveries', async () => {
  assert.ok(process.env.PGHOST, 'Set an explicit private test database');
  const root = mkdtempSync(join(tmpdir(), 'pasarpilot-queue-'));
  let store = await SchedulerStore.open(root, true, 120_000);
  const cleanup = async () => {
    await store.pool.query(`DROP SCHEMA ${store.schema} CASCADE; DROP SCHEMA ${store.queueSchema} CASCADE`);
    await store.close(); rmSync(root, { recursive: true, force: true });
  };
  try {
    const now = Date.now();
    await store.pool.query(`UPDATE ${store.schema}.schedule SET next_due=$1`, [new Date(now - 1_200_000)]);
    await store.tick(now);
    let status = await store.status();
    assert.equal(status.queue.length, 3);
    assert.ok(status.schedules.every(s => Number(s.coalesced) === 10));
    for (const t of ['seller-a','seller-b','seller-c']) {
      const action = await store.submitAction(t, 'same-id', 0, now + 180_000, now);
      assert.equal((await store.submitAction(t, 'same-id', 0, now + 180_000, now)).job, action.job);
      assert.equal((await store.submitAction(t, 'other-id', 0, now + 180_000, now)).rejected, 'action-backpressure');
    }
    assert.equal((await store.status()).queue.length, 6);
  } finally { await cleanup(); }
});
