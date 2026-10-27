import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { initialise, writeJson } from './storage.js';
import { Ownership, holdLock } from './ownership.js';
import { Session } from './runtime.js';
import { fixtureOrigin, podman } from './container.js';
import { heartbeat } from './recovery.js';
import { allowance, admit, sampleAttempt, PressureGuard } from './metrics.js';
import { sampleHost, minecraftPids } from './host.js';

export async function concurrency(parent: string, slots: number) {
  assert.ok(slots === 2 || slots === 4, 'only-two-or-four-slots');
  const runs = join(parent, 'runs');
  const readRun = (name: string) => JSON.parse(readFileSync(join(runs, name), 'utf8'));
  const names = readdirSync(runs);
  const latest = (prefix: string) => names.filter(n => n.startsWith(prefix) && /^.*-\d+\.json$/.test(n)).sort().at(-1);
  const a = latest('continuous-'), b = latest('rotation-');
  if (!a || !b || !readRun(a).complete || !readRun(b).complete) throw Error('complete-primary-arms-required');
  if (slots === 4) {
    const two = latest('concurrency-2-');
    if (!two || !readRun(two).complete) throw Error('safe-two-slot-result-required');
  }
  const manifest = readRun('../manifest.json');
  const cap = allowance(Math.max(readRun(a).peak, readRun(b).peak));
  const controller = await holdLock(join(parent, 'locks', 'supervisor.lock'));
  const runId = `concurrency-${slots}-${Date.now()}`;
  const root = initialise(join(parent, runId));
  const samples: { time: number; host: ReturnType<typeof sampleHost>; attempts: ReturnType<typeof sampleAttempt>[] }[] = [];
  const cohorts: { cohort: number; durationMs: number; forcedIdleMs: number; occupiedCycleMs: number; counters: number[] }[] = [];
  const active: { owner: Ownership; session: Session; stopHeartbeat: () => void }[] = [];
  const guard = new PressureGuard();
  let error: string | undefined, skipped = false, collector: ReturnType<typeof setInterval> | undefined;
  const cleanup = async () => {
    for (const item of active.splice(0)) {
      const dead = await item.session.stop();
      item.stopHeartbeat();
      if (!dead) throw Error('termination-unproven');
      await item.owner.release(true); podman(['rm', item.owner.lease.container]);
    }
  };
  try {
    if (minecraftPids().length) throw Error('minecraft-still-running');
    try { admit(sampleHost(), cap * slots, 0, 1, 0, manifest.poolBudget); }
    catch (e) { skipped = true; throw e; }
    collector = setInterval(() => {
      try {
        const host = sampleHost(); guard.check(host);
        if (minecraftPids().length) throw Error('minecraft-restarted');
        const attempts = active.filter(a => a.session.cgroup).map(a => sampleAttempt(a.session.cgroup!));
        for (const attempt of attempts) if (attempt.events?.oom || attempt.events?.oom_kill || attempt.swapMax !== 0) throw Error('attempt-resource-failure');
        samples.push({ time: Date.now(), host, attempts });
      } catch (e) { error ??= (e as Error).message; for (const a of active) void a.session.stop().catch(() => undefined); }
    }, 1000);
    for (let cohort = 0; cohort < 3; cohort++) {
      if (error) throw Error(error);
      const start = Date.now();
      for (const tenant of ['seller-a', 'seller-b', 'seller-c', 'seller-d'].slice(0, slots)) {
        admit(sampleHost(), cap, active.length, slots, active.length * cap, manifest.poolBudget);
        const owner = await Ownership.acquire(root, tenant);
        const session = new Session(owner, cap, fixtureOrigin());
        const stopHeartbeat = heartbeat(owner, e => { error ??= e.message; void session.stop().catch(() => undefined); });
        active.push({ owner, session, stopHeartbeat });
      }
      await Promise.all(active.map(async a => { await a.session.ready; a.session.verifyLimits(cap); }));
      const replies = await Promise.all(active.map(a => a.session.send({ op: 'visit', counter: cohort - 1, seed: cohort === 0 })));
      for (const reply of replies) assert.equal(reply.counter, cohort);
      // Keep the concurrent working set live long enough for comparable one-second samples.
      const idleStart = Date.now();
      await delay(5000);
      const forcedIdleMs = Date.now() - idleStart;
      samples.push({ time: Date.now(), host: sampleHost(), attempts: active.map(a => sampleAttempt(a.session.cgroup!)) });
      await cleanup();
      const durationMs = Date.now() - start;
      cohorts.push({ cohort, durationMs, forcedIdleMs, occupiedCycleMs: durationMs - forcedIdleMs, counters: replies.map(r => Number(r.counter)) });
    }
  } catch (e) { error ??= (e as Error).message; }
  finally {
    if (collector) clearInterval(collector);
    try { await cleanup(); } catch (e) { error ??= (e as Error).message; }
    const result = { runId, slots, cap, aggregateAllowance: cap * slots, poolBudget: manifest.poolBudget,
      complete: !error && cohorts.length === 3, skipped, error, cohorts, samples, sourceArms: [a, b] };
    writeJson(join(runs, `${runId}.json`), result); controller.stdin.end();
    console.log(JSON.stringify({ runId, complete: result.complete, skipped, error, cap, cohorts: cohorts.length }));
  }
  if (error && !skipped) throw Error(error);
}
