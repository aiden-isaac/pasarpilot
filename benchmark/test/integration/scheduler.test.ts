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
    const a = (await store.claim())!;
    assert.equal(a.data.tenant, 'seller-a');
    await store.check(a, now);
    await store.attach(a, { attempt: 'synthetic-attempt', generation: 1 });
    await store.finish(a, { outcome: 'failed', error: 'fixture-unavailable' }, now);
    const retry = await store.boss.getJobById(a.name, a.id);
    assert.equal(retry!.state, 'retry');
    assert.ok(retry!.startAfter.getTime() >= Date.now() + 28_000);
    const b = (await store.claim())!;
    assert.equal(b.data.tenant, 'seller-b');
    await store.finish(b, { outcome: 'completed' }, now);
    await store.close();
    store = await SchedulerStore.open(root);
    const c = (await store.claim())!;
    assert.equal(c.data.tenant, 'seller-c');
    await store.finish(c, { outcome: 'completed' }, now);
    const actionA = (await store.claim())!;
    assert.equal(actionA.data.kind, 'action');
    assert.equal(actionA.data.tenant, 'seller-a');
    await store.uncertain(actionA);
    await store.finish(actionA, { outcome: 'uncertain' }, now);
    assert.equal((await store.submitAction('seller-a', 'same-id', 0, now - 1, now)).outcome, 'uncertain');
    assert.equal((await store.submitAction('seller-a', 'new-id', 1, now + 180_000)).rejected, 'action-backpressure');
    const actionB = (await store.claim())!;
    await store.cancel(actionB.id);
    await assert.rejects(store.check(actionB, now), /cancelled/);
    await store.finish(actionB, { outcome: 'cancelled' }, now);
    const actionC = (await store.claim())!;
    await store.configure('seller-c', false);
    await assert.rejects(store.check(actionC, now), /cancelled/);
    await store.finish(actionC, { outcome: 'cancelled' }, now);
    await store.pool.query(`UPDATE ${store.queueSchema}.job SET start_after=now()-interval '1 second' WHERE id=$1`, [a.id]);
    const a2 = (await store.claim())!;
    assert.equal(a2.id, a.id); assert.equal(a2.retryCount, 1);
    await assert.rejects(store.finish(a, { outcome: 'completed' }, now), /queue-ownership-lost/);
    await store.finish(a2, { outcome: 'failed', error: 'fixture-unavailable' }, now);
    await store.pool.query(`UPDATE ${store.queueSchema}.job SET start_after=now()-interval '1 second' WHERE id=$1`, [a.id]);
    const a3 = (await store.claim())!;
    assert.equal(a3.retryCount, 2);
    await store.finish(a3, { outcome: 'failed', error: 'fixture-unavailable' }, now);
    assert.equal((await store.boss.getJobById(a.name, a.id))!.state, 'completed');
    status = await store.status();
    assert.equal(status.queue.length, 0);
    assert.equal(Number(status.identity.rejected), 4);
    assert.equal(status.attempts.length, 8);
    await store.pool.query(`UPDATE ${store.schema}.schedule SET next_due=now()`);
    await store.tick();
    const broken = (await store.claim())!;
    assert.equal(broken.name, 'seller-b');
    await store.finish(broken, { outcome: 'failed', error: 'page.evaluate: Error: persistence-or-isolation\n at fixtureStorage' });
    await store.tick(Date.now()+120000);
    assert.equal((await store.status()).schedules.find(s=>s.tenant==='seller-b').blocked, 'persistence-or-isolation');
    assert.ok((await store.status()).queue.every(j=>j.name!=='seller-b'));
    const healthy = (await store.claim())!;
    assert.equal(healthy.name,'seller-a'); await store.finish(healthy,{outcome:'completed'});
    await store.pool.query(`UPDATE ${store.schema}.identity SET version=999`);
    await assert.rejects(SchedulerStore.open(root), /incompatible-scheduler-dataset/);
    await store.pool.query(`UPDATE ${store.schema}.identity SET version=1`);
  } finally { await cleanup(); }
});

test('rollback, restart replay and consumer transaction keep accepted work and results intact', async () => {
  assert.ok(process.env.PGHOST);
  const root = mkdtempSync(join(tmpdir(), 'pasarpilot-replay-'));
  const store = await SchedulerStore.open(root, true, 120_000);
  try {
    await store.pool.query(`CREATE FUNCTION ${store.schema}.reject_advance() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected-advance-failure'; END $$;
      CREATE TRIGGER fail_advance BEFORE UPDATE ON ${store.schema}.schedule FOR EACH ROW EXECUTE FUNCTION ${store.schema}.reject_advance()`);
    await assert.rejects(store.tick(), /injected-advance-failure/);
    assert.equal((await store.status()).queue.length, 0);
    await store.pool.query(`DROP TRIGGER fail_advance ON ${store.schema}.schedule`);
    await store.tick();
    const job = (await store.claim())!;
    const event = { schemaVersion: 1 as const, eventId: 'event-1', sourceId: `${job.name}:0`, tenant: job.name,
      sourceRevision: 0, attemptId: 'old-attempt', generation: 1, observedAt: new Date().toISOString(), eventCount: 400 };
    await store.pool.query(`CREATE TRIGGER fail_receipt BEFORE UPDATE ON ${store.schema}.attempt FOR EACH ROW EXECUTE FUNCTION ${store.schema}.reject_advance()`);
    await assert.rejects(store.finish(job, { outcome: 'completed', observation: event }), /injected-advance-failure/);
    assert.equal((await store.status()).consumed, 0);
    assert.equal((await store.boss.getJobById(job.name, job.id))!.state, 'active');
    await store.pool.query(`DROP TRIGGER fail_receipt ON ${store.schema}.attempt`);
    await store.finish(job, { outcome: 'completed', observation: event });
    await store.finish(job, { outcome: 'completed', observation: event }, Date.now(), true);
    assert.equal((await store.status()).consumed, 1);
    const stale = (await store.claim())!;
    await assert.rejects(store.check(stale, stale.data.deadline), /deadline-expired/);
    await store.finish(stale, { outcome: 'skipped', error: 'deadline-expired' });
    assert.equal((await store.status()).consumed, 1);
  } finally {
    await store.pool.query(`DROP SCHEMA ${store.schema} CASCADE; DROP SCHEMA ${store.queueSchema} CASCADE`);
    await store.close(); rmSync(root, { recursive: true, force: true });
  }
});
