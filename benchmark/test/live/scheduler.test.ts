import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { SchedulerStore, type Claim } from '../../src/scheduler-store.js';
import { executeJob, recoverJobs, ownedSession, recoverTenant, reconcileAction, type SchedulerManifest } from '../../src/scheduler.js';
import { Ownership, holdLock, readLease } from '../../src/ownership.js';
import { podman, inspect, rootLabel, fixtureOrigin } from '../../src/container.js';
import { initialise, writeJson } from '../../src/storage.js';
import { observations, actionGate } from '../../src/events.js';
import { scheduledTenants, type ScheduledTenant } from '../../src/schedule.js';

test('prepared-host scheduler fault recovery preserves ownership, durable results and action uncertainty', { timeout: 300_000 }, async () => {
  const parent = process.env.SCHEDULER_DATA_ROOT;
  assert.ok(parent, 'Set SCHEDULER_DATA_ROOT to an explicitly prepared, idle fixture dataset');
  const lock = await holdLock(join(parent, 'locks', 'supervisor.lock'));
  const root = initialise(join(parent, `faults-${Date.now()}`));
  const manifest = JSON.parse(readFileSync(join(parent, 'manifest.json'), 'utf8')) as SchedulerManifest;
  const socket = join(parent, 'socket');
  let store = await SchedulerStore.open(root, true, 120_000, socket);
  const cases: { name: string; passed: boolean; ms: number; error?: string }[] = [];
  let complete = false;
  const record = () => writeJson(join(root, 'runs', 'fixture-faults.json'), { schemaVersion: 1, complete, cases });
  const checkCase = async (name: string, fn: () => Promise<void>) => {
    const start = Date.now();
    try { await fn(); cases.push({ name, passed: true, ms: Date.now() - start }); }
    catch (error) { cases.push({ name, passed: false, ms: Date.now() - start, error: (error as Error).message }); throw error; }
    finally { record(); console.log(JSON.stringify(cases.at(-1))); }
  };
  const prepare = async (t: ScheduledTenant) => {
    for (const row of (await store.status()).queue) await store.boss.cancel(row.name, row.id);
    await store.pool.query(`UPDATE ${store.schema}.action SET outcome='cancelled' WHERE outcome='queued'`);
    await store.pool.query(`UPDATE ${store.schema}.schedule SET observation=NULL,latest_due=NULL,first_pending=NULL`);
    for (const value of scheduledTenants) await store.configure(value, value === t, 120_000);
    await store.pool.query(`UPDATE ${store.schema}.schedule SET next_due=now() WHERE tenant=$1`, [t]);
  };
  const observationJob = async (t: ScheduledTenant) => {
    await prepare(t); await store.tick();
    const job = (await store.claim())!;
    assert.equal(job.data.tenant, t); assert.equal(job.data.kind, 'observation'); return job;
  };
  const run = async (job: Claim) => {
    const result = await executeJob(store, job, manifest); await store.finish(job, result); return result;
  };
  const control = async (t: ScheduledTenant, path: string, data: unknown) => ownedSession(root, t, manifest, Date.now() + 120_000,
    () => store.healthy(), async () => undefined, async (_owner, session) => {
      await session.send({ op: 'control', path, data }); return { outcome: 'controlled' };
    });
  try {
    await checkCase('seed-three-profiles-and-clean-flush', async () => {
      for (const t of scheduledTenants) assert.equal((await run(await observationJob(t))).outcome, 'completed');
      assert.equal((await store.status()).consumed, 3);
    });
    await checkCase('burst-coalescing-six-job-bound-and-fair-turns', async () => {
      await prepare('seller-a');
      for (const t of scheduledTenants) await store.configure(t, true, 120_000);
      await store.pool.query(`UPDATE ${store.schema}.schedule SET next_due=now()-make_interval(secs => 12000)`);
      await store.tick();
      for (const t of scheduledTenants) {
        assert.ok((await store.submitAction(t, 'burst-action', 0, Date.now() + 180000)).job);
        assert.equal((await store.submitAction(t, 'overflow', 0, Date.now() + 180000)).rejected, 'action-backpressure');
      }
      assert.equal((await store.status()).queue.length, 6);
      const turns: string[] = [];
      for (let i = 0; i < 6; i++) { const job = (await store.claim())!; turns.push(job.name); await store.finish(job, { outcome: 'injected-skip' }); }
      assert.deepEqual(turns.slice(0,3), turns.slice(3)); assert.equal(new Set(turns.slice(0,3)).size, 3);
    });
    await checkCase('active-cancellation-fences-next-browser-operation', async () => {
      const job = await observationJob('seller-a'), previous = observations(root).length;
      const check = store.check.bind(store); let cancelled = false;
      store.check = async (...args) => {
        const path = join(root, 'locks', 'seller-a.json');
        if (!cancelled && existsSync(path) && readLease(path).state === 'monitoring') { cancelled = true; await store.cancel(job.id); }
        await check(...args);
      };
      try { assert.equal((await run(job)).error, 'cancelled'); }
      finally { store.check = check; }
      assert.ok(cancelled); assert.equal(observations(root).length, previous);
      assert.equal(readLease(join(root, 'locks', 'seller-a.json')).state, 'stored');
    });
    await checkCase('active-schedule-revision-fences-next-operation', async () => {
      const job = await observationJob('seller-a'), check = store.check.bind(store); let changed = false;
      store.check = async (...args) => {
        const path = join(root, 'locks', 'seller-a.json');
        if (!changed && existsSync(path) && readLease(path).state === 'monitoring') { changed = true; await store.configure('seller-a', true); }
        await check(...args);
      };
      try { assert.equal((await run(job)).error, 'obsolete-revision'); }
      finally { store.check = check; }
      assert.ok(changed);
    });
    for (const boundary of ['claim','flush','release','survivor']) await checkCase(`supervisor-crash-at-${boundary}`, async () => {
      await prepare('seller-a');
      const previous = (await store.status()).consumed;
      const child = spawn(process.execPath, ['dist/test/live/crash-child.js', root, socket, parent, boundary], { stdio: ['ignore','pipe','pipe'] });
      let output = '', errors = '';
      child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { errors += b; });
      const exit = await new Promise<{ code: number | null; signal: string | null }>((resolve, reject) => {
        const timer = setTimeout(() => { child.kill('SIGKILL'); reject(Error('crash-child-timeout')); }, 30000);
        child.once('error', reject); child.once('exit', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
      });
      child.stdout.destroy(); child.stderr.destroy();
      assert.equal(exit.signal, 'SIGKILL', errors);
      const marker = JSON.parse(output.trim().split('\n').at(-1)!);
      if (boundary === 'survivor') {
        assert.ok(inspect(marker.container).State.Running);
        const path = join(root, 'locks', `${marker.tenant}.json`);
        const expired = { ...readLease(path), expires: Date.now() - 1 };
        writeJson(path, expired); writeJson(join(root, 'attempts', expired.attempt, 'lease.json'), expired);
        await store.pool.query(`UPDATE ${store.queueSchema}.job SET started_on=now()-make_interval(secs => 181) WHERE id=$1`, [marker.job]);
        await store.boss.expire();
        await assert.rejects(Ownership.acquire(root, marker.tenant), /reconciliation/);
      }
      const supervisor = await holdLock(join(root, 'locks', 'supervisor.lock'));
      try { await recoverJobs(store); } finally { supervisor.stdin.end(); }
      assert.equal(podman(['ps','-q','--filter',`label=io.pasarpilot.root=${rootLabel(root)}`]), '');
      assert.equal((await store.status()).consumed, previous + (boundary === 'flush' || boundary === 'release' ? 1 : 0));
      await recoverJobs(store);
      assert.equal((await store.status()).consumed, previous + (boundary === 'flush' || boundary === 'release' ? 1 : 0));
    });
    await checkCase('history-unavailable-blocks-until-explicit-recovery', async () => {
      await control('seller-b', '/api/history', { locked: true });
      assert.equal((await run(await observationJob('seller-b'))).error, 'history-unavailable');
      assert.equal((await store.status()).schedules.find(s => s.tenant === 'seller-b').blocked, 'history-unavailable');
      await store.tick(); assert.equal((await store.status()).queue.length, 0);
      assert.equal((await recoverTenant(store, 'seller-b', 'history', manifest)).outcome, 'verified');
      assert.equal((await run(await observationJob('seller-b'))).outcome, 'completed');
    });
    await checkCase('authentication-expiry-blocks-until-explicit-recovery', async () => {
      await control('seller-c', '/api/expire', {});
      assert.equal((await run(await observationJob('seller-c'))).error, 'reauth-required');
      assert.equal((await recoverTenant(store, 'seller-c', 'auth', manifest)).outcome, 'verified');
      assert.equal((await run(await observationJob('seller-c'))).outcome, 'completed');
    });
    await checkCase('stale-action-rejected-before-send', async () => {
      await prepare('seller-a');
      await store.submitAction('seller-a','stale-effect',999,Date.now()+120000);
      assert.equal((await run((await store.claim())!)).outcome, 'rejected');
    });
    await checkCase('lost-action-acknowledgement-reconciles-without-resend', async () => {
      await prepare('seller-a');
      const submitted = await store.submitAction('seller-a','uncertain-effect',0,Date.now()+120000);
      const job = (await store.claim())!;
      await ownedSession(root,'seller-a',manifest,job.data.deadline,()=>store.check(job),async owner => {
        await store.attach(job,{ attempt:owner.lease.attempt,generation:owner.lease.generation });
      },async (owner,session) => {
        await store.uncertain(job); actionGate(owner,'uncertain-effect',0,0);
        assert.equal((await session.send({op:'action',actionId:'uncertain-effect',expectedRevision:0})).status,200);
        return {outcome:'uncertain'};
      });
      await recoverJobs(store);
      assert.equal((await store.status()).actions.find(a=>a.job===submitted.job).outcome,'uncertain');
      assert.equal((await reconcileAction(store,'seller-a','uncertain-effect',manifest)).outcome,'applied');
      assert.equal((await store.submitAction('seller-a','uncertain-effect',0,Date.now()+120000)).outcome,'applied');
    });
    await checkCase('unacknowledged-action-retains-its-allowance', async () => {
      await prepare('seller-b');
      const submitted = await store.submitAction('seller-b','never-acknowledged',0,Date.now()+120000);
      const job = (await store.claim())!;
      await ownedSession(root,'seller-b',manifest,job.data.deadline,()=>store.check(job),async owner => {
        await store.attach(job,{attempt:owner.lease.attempt,generation:owner.lease.generation});
      },async (owner,session) => {
        await store.uncertain(job); actionGate(owner,'never-acknowledged',0,0);
        assert.equal((await session.send({op:'action',actionId:'never-acknowledged',expectedRevision:0})).status,200);
        return {outcome:'uncertain'};
      });
      await store.finish(job,{outcome:'uncertain'});
      assert.equal((await store.submitAction('seller-b','overflow-after-uncertainty',1,Date.now()+120000)).rejected,'action-backpressure');
      assert.equal((await store.status()).actions.find(a=>a.job===submitted.job).outcome,'uncertain');
    });
    await checkCase('database-outage-cleans-browser-before-restart-settlement', async () => {
      const job = await observationJob('seller-c');
      const database = JSON.parse(readFileSync(join(parent,'database.json'),'utf8'));
      const check = store.check.bind(store); let stopped = false;
      store.check = async (...args) => {
        const path=join(root,'locks','seller-c.json');
        if(!stopped && existsSync(path) && readLease(path).state==='monitoring') {
          stopped=true; podman(['stop','--time','5',database.container]);
        }
        await check(...args);
      };
      try {
        const result=await executeJob(store,job,manifest);
        assert.equal(result.outcome,'failed'); assert.ok(stopped);
        assert.equal(podman(['ps','-q','--filter',`label=io.pasarpilot.root=${rootLabel(root)}`]),'');
      } finally {
        await store.close(); podman(['start',database.container]);
        for(let i=0;i<30;i++) {
          try { podman(['exec',database.container,'pg_isready','-q','-U','fixture']); break; }
          catch { if(i===29) throw Error('database-restart-timeout'); await delay(1000); }
        }
        store=await SchedulerStore.open(root,false,120000,socket);
      }
      await recoverJobs(store);
      assert.equal((await run(await observationJob('seller-c'))).outcome,'completed');
    });
    await checkCase('fixture-reset-loses-action-evidence-without-authorising-resend', async () => {
      const fixture=inspect('pasarpilot-fixture');
      assert.equal(fixture.Config.Labels['io.pasarpilot.benchmark'],'true');
      const oldOrigin=fixtureOrigin();
      podman(['stop','--time','5','pasarpilot-fixture']); podman(['start','pasarpilot-fixture']);
      if(fixtureOrigin()===oldOrigin) {
        assert.equal((await recoverTenant(store,'seller-b','auth',manifest)).outcome,'verified');
        assert.equal((await reconcileAction(store,'seller-b','never-acknowledged',manifest)).outcome,'uncertain');
      } else {
        await assert.rejects(recoverTenant(store,'seller-b','auth',manifest),/persistence-or-isolation/);
      }
      assert.equal((await store.status()).actions.find(a=>a.tenant==='seller-b' && a.id==='never-acknowledged').outcome,'uncertain');
    });
    await checkCase('incomplete-ledger-is-retained-and-recovery-stops', async () => {
      const isolated = initialise(join(root,'malformed-ledger'));
      appendFileSync(join(isolated,'events','observations.jsonl'),'{"incomplete":', {mode:0o600});
      assert.throws(()=>observations(isolated),/incomplete-observation-ledger/);
      assert.equal(readFileSync(join(isolated,'events','observations.jsonl'),'utf8'),'{"incomplete":');
    });
    await prepare('seller-a'); await store.configure('seller-a',false);
    const status=await store.status();
    assert.equal(status.queue.length,0); assert.equal((await store.pendingAttempts()).length,0);
    assert.ok(status.actions.every(a=>a.outcome!=='queued'));
    complete=true; record();
  } finally {
    try { await recoverJobs(store); } finally { await store.close(); lock.stdin.end(); }
    console.log(JSON.stringify({fixtureFaultData:root,complete,cases:cases.length}));
  }
});
