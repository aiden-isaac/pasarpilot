import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import { Ownership, holdLock, readLease } from './ownership.js';
import { Session } from './runtime.js';
import { heartbeat, reconcile } from './recovery.js';
import { fixtureOrigin, inspect, podman, rootLabel, label } from './container.js';
import { defaults } from './config.js';
import { sampleHost, minecraftPids } from './host.js';
import { admit, PressureGuard, sampleAttempt } from './metrics.js';
import { writeJson } from './storage.js';
import { observations, actionGate } from './events.js';
import { inspectVisit, closeVisit } from './visit.js';
import { SchedulerStore, type Claim, type Outcome } from './scheduler-store.js';
import { tenant, actionId, type ScheduledTenant } from './schedule.js';

export type SchedulerManifest = { schemaVersion: 1; poolBudget: number; minecraftStopped: boolean; measuredAllowance?: number };
const reason = (error: unknown) => error instanceof Error ? error.message : 'scheduler-failed';

export async function ownedSession(root: string, t: ScheduledTenant, manifest: SchedulerManifest, deadline: number,
  check: () => Promise<void>, attach: (owner: Ownership) => Promise<void>, work: (owner: Ownership, session: Session) => Promise<Outcome>) {
  if (!manifest.minecraftStopped || minecraftPids().length) throw Error('host-preparation-required');
  await check();
  const cap = manifest.measuredAllowance ?? defaults.capBytes;
  admit(sampleHost(), cap, 0, 1, 0, manifest.poolBudget);
  const start = performance.now();
  const owner = await Ownership.acquire(root, t);
  owner.lease.deadline = Math.min(deadline, Date.now() + defaults.visitTimeoutMs); owner.lease.operationGuard = true; owner.persist();
  let session: Session | undefined, failure: string | undefined, checking = false;
  let result: Outcome = { outcome: 'failed' }, peak = 0;
  const hostSamples: ReturnType<typeof sampleHost>[] = [];
  const resourceSamples: ReturnType<typeof sampleAttempt>[] = [];
  const guard = new PressureGuard();
  const fail = (error: unknown) => {
    failure ??= reason(error);
    const actual = readLease(owner.statePath);
    if (actual.attempt === owner.lease.attempt && actual.generation === owner.lease.generation) {
      owner.lease.cancelled = true; owner.lease.state = 'stopping'; owner.lease.reason = failure; owner.persist();
    }
    if (session) void session.stop().catch(() => undefined);
  };
  const stopHeartbeat = heartbeat(owner, fail);
  const timer = setInterval(() => {
    if (checking) return;
    checking = true;
    void (async () => {
      if (minecraftPids().length) throw Error('minecraft-restarted-during-run');
      if (Date.now() >= owner.lease.deadline!) throw Error('deadline-expired');
      const sample = sampleHost(); hostSamples.push(sample); guard.check(sample);
      if (session?.cgroup) {
        const resources = sampleAttempt(session.cgroup); resourceSamples.push(resources);
        peak = Math.max(peak, resources.peak ?? resources.memory ?? 0);
        if (!resources.memory || resources.swapMax !== 0 || !resources.events || resources.events.oom || resources.events.oom_kill) throw Error('attempt-resource-failure');
      }
      await check();
    })().catch(fail).finally(() => { checking = false; });
  }, 1000);
  try {
    await attach(owner);
    await check(); owner.check();
    session = new Session(owner, cap, fixtureOrigin(), false, check);
    const ready = await session.ready;
    if (!ready.sandbox) throw Error('sandbox-unverified');
    session.verifyLimits(cap);
    owner.lease.state = 'monitoring'; owner.persist();
    result = await work(owner, session);
    if (failure) throw Error(failure);
    writeJson(join(owner.attemptPath, 'outcome.json'), result);
  } catch (error) {
    failure ??= reason(error);
    result = { ...result, outcome: result.outcome === 'uncertain' ? 'uncertain' : 'failed', error: failure };
    fail(error);
  } finally {
    clearInterval(timer);
    while (checking) await delay(10);
    try {
      const cleanupStart = performance.now();
      if (session) {
        await closeVisit(owner, session, /reauth|history-unavailable/.test(failure ?? '') ? 'reauth-required' : 'stored');
        if (session.finalResources) {
          resourceSamples.push(session.finalResources);
          peak = Math.max(peak, session.finalResources.peak ?? session.finalResources.memory ?? 0);
        }
        if (performance.now() - cleanupStart > 40_000) throw Error('cleanup-bound-exceeded');
      } else await owner.release(true);
      result = { ...result, attempt: owner.lease.attempt, generation: owner.lease.generation,
        occupiedMs: performance.now() - start, cleanupMs: performance.now() - cleanupStart, peak };
      writeJson(join(owner.attemptPath, 'terminated.json'), { ...result, hostSamples, resourceSamples });
    } catch (error) { throw Error(`termination-unproven: ${reason(error)}`); }
    finally { stopHeartbeat(); }
  }
  if (/isolation-failure|host-pressure|attempt-resource|minecraft-restarted|missing-psi|sandbox/.test(failure ?? '')) throw Error(failure);
  return result;
}

export async function executeJob(store: SchedulerStore, job: Claim, manifest: SchedulerManifest, cancelled = () => false): Promise<Outcome> {
  const check = async () => { if (cancelled()) throw Error('supervisor-stopping'); await store.check(job); };
  return ownedSession(store.root, job.data.tenant, manifest, job.data.deadline, check, async owner => {
    writeJson(join(owner.attemptPath, 'job.json'), { id: job.id, name: job.name, retryCount: job.retryCount, data: job.data });
    await store.attach(job, { attempt: owner.lease.attempt, generation: owner.lease.generation });
  }, async (owner, session) => {
    if (job.data.kind === 'observation') {
      const { observation, reply, flushMs } = await inspectVisit(owner, session, check);
      return { outcome: 'completed', observation, flushMs, startupMs: await session.ready.then(r => r.startupMs),
        restorationMs: reply.restorationMs, inspectionMs: reply.inspectionMs };
    }
    throw Error('unsupported-job-kind');
  });
}

export async function recoverJobs(store: SchedulerStore) {
  reconcile(store.root);
  const ledger = observations(store.root);
  for (const pending of await store.pendingAttempts()) {
    const current = await store.boss.getJobById<typeof pending.data>(pending.data.tenant, pending.job, { includeArchive: true });
    if (!current) throw Error('interrupted-job-missing');
    const job: Claim = { ...current, data: pending.data, retryCount: pending.delivery };
    let attempt = pending.owner?.attempt;
    if (!attempt) {
      attempt = readdirSync(join(store.root, 'attempts')).find(name => {
        const path = join(store.root, 'attempts', name, 'job.json');
        if (!existsSync(path)) return false;
        const saved = JSON.parse(readFileSync(path, 'utf8'));
        return saved.id === pending.job && saved.retryCount === pending.delivery;
      });
    }
    const event = attempt ? ledger.find(e => e.attemptId === attempt) : undefined;
    if (event && (event.tenant !== pending.data.tenant || (pending.owner && event.generation !== pending.owner.generation))) throw Error('observation-owner-mismatch');
    const resultPath = attempt ? join(store.root, 'attempts', attempt, 'terminated.json') : '';
    let result: Outcome = existsSync(resultPath) ? JSON.parse(readFileSync(resultPath, 'utf8')) : { outcome: 'failed', error: 'supervisor-interrupted' };
    if (typeof result.outcome !== 'string' || (result.observation && !event)) throw Error('invalid-attempt-evidence');
    if (event) {
      writeJson(join(store.root, 'locks', `${event.tenant}.counter.json`), { counter: event.sourceRevision, seedAttempted: true });
      result = { ...result, outcome: 'completed', error: undefined, observation: event };
    } else if (pending.data.kind === 'action') {
      const action = (await store.pool.query(`SELECT outcome FROM ${store.schema}.action WHERE job=$1`, [pending.job])).rows[0];
      const path = join(store.root, 'events', `${pending.data.tenant}-${pending.data.actionId}.json`);
      const local = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined;
      if (local && (local.id !== pending.data.actionId || local.tenant !== pending.data.tenant || !['applied','uncertain'].includes(local.state))) throw Error('invalid-action-evidence');
      if (local?.state === 'applied') result = { outcome: 'applied' };
      else if (action?.outcome === 'uncertain' || local) result = { outcome: 'uncertain', error: 'action-needs-reconciliation' };
    }
    await store.finish(job, result, Date.now(), true);
  }
  for (const name of podman(['ps', '-a', '--filter', `label=io.pasarpilot.root=${rootLabel(store.root)}`, '--format', '{{.Names}}']).split('\n').filter(Boolean)) {
    const record = inspect(name);
    if (record.State.Running || record.Config.Labels[label] !== 'true') throw Error('termination-unproven');
    podman(['rm', name]);
  }
  await store.boss.maintain();
}

export async function runScheduler(store: SchedulerStore, manifest: SchedulerManifest, count: number) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 10000) throw Error('invalid-planned-visit-count');
  const lock = await holdLock(join(store.root, 'locks', 'supervisor.lock'));
  let stopping = false, dispatched = 0;
  const stop = () => { stopping = true; };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  const runId = `scheduler-${Date.now()}`;
  const results: { job: string; tenant: string; retry: number; dueAt: number; waitMs: number; latenessMs: number; result: Outcome }[] = [];
  let error: string | undefined;
  try {
    writeJson(join(store.root, 'runs', `${runId}.plan.json`), { schemaVersion: 1, planned: count, manifest,
      schedules: (await store.status()).schedules, versions: JSON.parse(readFileSync(join(store.root, 'scheduler.json'), 'utf8')), startedAt: Date.now() });
    await recoverJobs(store);
    let lastMaintenance = Date.now();
    while (!stopping && dispatched < count) {
      if (Date.now() - lastMaintenance >= 60_000) { await store.boss.maintain(); lastMaintenance = Date.now(); }
      await store.tick();
      // Admission happens before claiming: denial must not consume a tenant turn or queue retry.
      try { admit(sampleHost(), manifest.measuredAllowance ?? defaults.capBytes, 0, 1, 0, manifest.poolBudget); }
      catch (failure) {
        if (reason(failure) !== 'resource-admission-denied') throw failure;
        await delay(1000); continue;
      }
      const job = await store.claim();
      if (!job) { await delay(250); continue; }
      const start = Date.now();
      let result: Outcome;
      try { await store.check(job); result = await executeJob(store, job, manifest, () => stopping); }
      catch (failure) {
        if (/^(cancelled|obsolete-revision|deadline-expired)$/.test(reason(failure))) result = { outcome: 'skipped', error: reason(failure) };
        else throw failure;
      }
      await store.healthy();
      await store.finish(job, result);
      dispatched++;
      results.push({ job: job.id, tenant: job.name, retry: job.retryCount, dueAt: job.data.dueAt,
        waitMs: start - job.data.firstPending, latenessMs: Math.max(0, start - job.data.dueAt), result });
      writeJson(join(store.root, 'runs', `${runId}.progress.json`), { schemaVersion: 1, planned: count, results, status: await store.status() });
      console.log(JSON.stringify({ runId, dispatched, tenant: job.name, outcome: result.outcome, error: result.error }));
    }
  } catch (failure) { error = reason(failure); throw failure; }
  finally {
    process.off('SIGTERM', stop); process.off('SIGINT', stop);
    writeJson(join(store.root, 'runs', `${runId}.json`), { schemaVersion: 1, planned: count, complete: dispatched === count && !error, error, results, endedAt: Date.now() });
    lock.stdin.end();
  }
}

export async function recoverTenant(store: SchedulerStore, value: string, mode: 'verify' | 'history' | 'auth', manifest: SchedulerManifest) {
  const t = tenant(value), lock = await holdLock(join(store.root, 'locks', 'supervisor.lock'));
  try {
    await recoverJobs(store);
    const result = await ownedSession(store.root, t, manifest, Date.now() + 120_000, () => store.healthy(), async () => undefined, async (owner, session) => {
      if (mode !== 'verify') await session.send({ op: 'control', path: mode === 'history' ? '/api/history' : `/seed/${t}`, data: { locked: false } });
      const counterFile = join(store.root, 'locks', `${t}.counter.json`);
      if (!existsSync(counterFile)) throw Error('committed-profile-required');
      const counter = JSON.parse(readFileSync(counterFile, 'utf8')).counter;
      await session.send({ op: 'verify', counter, seed: false }); owner.check();
      return { outcome: 'verified' };
    });
    if (result.outcome !== 'verified') throw Error(result.error);
    await store.resume(t);
    return result;
  } finally { lock.stdin.end(); }
}
