import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import { Ownership, holdLock } from './ownership.js';
import { Session } from './runtime.js';
import { heartbeat as keepLease, reconcile } from './recovery.js';
import { inspect, fixtureOrigin, podman } from './container.js';
import { admit, PressureGuard, sampleAttempt, allowance, diskUsage } from './metrics.js';
import { sampleHost, minecraftPids, baseline } from './host.js';
import { defaults } from './config.js';
import { initialise, writeJson } from './storage.js';
import { appendObservation, observations } from './events.js';

export type VisitResult = { tenant: string; ok: boolean; occupiedMs: number; startupMs: number;
  restorationMs?: number; inspectionMs?: number; flushMs?: number; shutdownMs?: number; error?: string };
export async function run(root: string, mode: 'pilot' | 'continuous' | 'rotation', count = 100, cadenceMs: number = defaults.cadenceMs) {
  initialise(root);
  if (!Number.isInteger(count) || count < 1 || count > 10000 || !Number.isFinite(cadenceMs) || cadenceMs < 0) throw Error('invalid-run-parameters');
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  if (!manifest.minecraftStopped || minecraftPids().length) throw Error('host-preparation-required');
  if (mode !== 'pilot' && cadenceMs !== manifest.cadenceMs) throw Error('cadence-not-declared-in-manifest');
  const controller = await holdLock(join(root, 'locks', 'supervisor.lock'));
  const results: VisitResult[] = [], hostSamples: ReturnType<typeof sampleHost>[] = [];
  const attemptSamples: { tenant: string; attempt: string; sample: ReturnType<typeof sampleAttempt> }[] = [];
  const runId = `${mode}-${Date.now()}`;
  const cap = manifest.measuredAllowance ?? defaults.capBytes;
  const diskBefore = diskUsage(join(root, 'profiles'));
  const guard = new PressureGuard();
  let owner: Ownership | undefined, session: Session | undefined;
  let startupMs = 0, failure: Error | undefined;
  let stopHeartbeat: (() => void) | undefined;
  const collect = () => {
    try {
      if (minecraftPids().length) throw Error('minecraft-restarted-during-run');
      const sample = sampleHost(); hostSamples.push(sample); guard.check(sample);
      if (session?.cgroup && owner) {
        const sample = sampleAttempt(session.cgroup);
        attemptSamples.push({ tenant: owner.lease.tenant, attempt: owner.lease.attempt, sample });
        if (!sample.memory || sample.swapMax !== 0 || (sample.events?.oom_kill ?? 0) > 0 || (sample.events?.oom ?? 0) > 0) throw Error('attempt-resource-failure');
      }
    } catch (error) {
      failure ??= error instanceof Error ? error : Error('collection-failed');
      if (owner && !owner.lease.cancelled) { try { owner.cancel(failure.message); } catch { /* Already fenced. */ } }
      if (session) void session.stop().catch(() => undefined);
    }
  };
  const collector = setInterval(collect, 1000);
  const stop = async () => {
    if (!session || !owner) return;
    const start = performance.now();
    // Stop sampling the disappearing cgroup only after retaining its final live counters.
    collect();
    const currentSession = session; session = undefined;
    const dead = await currentSession.stop();
    if (currentSession.finalResources) attemptSamples.push({ tenant: owner.lease.tenant,
      attempt: owner.lease.attempt, sample: currentSession.finalResources });
    if (!dead) throw Error('termination-unproven');
    await owner.release(true, failure?.message.includes('reauth') || failure?.message.includes('history-unavailable') ? 'reauth-required' : 'stored');
    stopHeartbeat?.(); stopHeartbeat = undefined;
    podman(['rm', currentSession.owner.lease.container]); owner = undefined;
    return performance.now() - start;
  };
  const start = async (tenant: string) => {
    if (failure) throw failure;
    admit(sampleHost(), cap, 0, 1, 0, manifest.poolBudget);
    owner = await Ownership.acquire(root, tenant);
    session = new Session(owner, cap, fixtureOrigin());
    stopHeartbeat = keepLease(owner, error => { failure = error; if (session) void session.stop().catch(() => undefined); });
    const ready = await session.ready;
    session.verifyLimits(cap); startupMs = Number(ready.startupMs);
    if (!ready.sandbox) throw Error('sandbox-unverified');
    owner.lease.state = 'monitoring'; owner.persist(); collect();
  };
  const runStart = Date.now();
  try {
    reconcile(root);
    for (let i = 0; i < count; i++) {
      const scheduled = runStart + i * cadenceMs;
      if (Date.now() < scheduled) await delay(scheduled - Date.now());
      if (failure) throw failure;
      const visitStart = performance.now();
      const tenant = mode === 'continuous' ? 'seller-a' : ['seller-a', 'seller-b', 'seller-c'][i % 3]!;
      try {
        if (!session) await start(tenant);
        const counterFile = join(root, 'locks', `${tenant}.counter.json`);
        const seed = !existsSync(counterFile);
        const counter = seed ? 0 : JSON.parse(readFileSync(counterFile, 'utf8')).counter;
        if (seed) writeJson(counterFile, { counter: 0, seedAttempted: true });
        const reply = await session!.send({ op: 'visit', counter, seed });
        const flushStart = performance.now();
        appendObservation(owner!, Number(reply.counter), Number(reply.events));
        writeJson(counterFile, { counter: reply.counter, seedAttempted: true });
        const flushMs = performance.now() - flushStart;
        const shutdownMs = mode === 'continuous' ? 0 : await stop();
        const result: VisitResult = { tenant, ok: true, occupiedMs: performance.now() - visitStart,
          startupMs: mode === 'continuous' && i > 0 ? 0 : startupMs,
          restorationMs: Number(reply.restorationMs), inspectionMs: Number(reply.inspectionMs), flushMs, shutdownMs };
        results.push(result);
        appendFileSync(join(root, 'runs', `${runId}.visits.jsonl`), JSON.stringify(result) + '\n', { mode: 0o600 });
        console.log(JSON.stringify({ mode, complete: results.length, tenant }));
      } catch (e) {
        failure = e instanceof Error ? e : Error('visit-failed');
        results.push({ tenant, ok: false, occupiedMs: performance.now() - visitStart, startupMs, error: failure.message });
        throw failure;
      }
    }
    if (mode === 'continuous') await delay(300_000);
  } catch (e) { failure ??= e instanceof Error ? e : Error('run-failed'); }
  finally {
    try { await stop(); } catch (e) { failure ??= e as Error; }
    clearInterval(collector); stopHeartbeat?.();
    const peak = Math.max(0, ...attemptSamples.map(s => s.sample.peak ?? s.sample.memory ?? 0));
    const result = { schemaVersion: 1, runId, mode, started: runStart, ended: Date.now(), count, cadenceMs, cap,
      results, hostSamples, attemptSamples, peak, error: failure?.message, complete: !failure && results.length === count,
      observedEventsAfterBrowserExit: observations(root).length,
      nextAllowance: peak > 0 ? allowance(peak) : null, runtimeImage: inspect('localhost/pasarpilot-benchmark:v1').Id,
      diskBefore, diskAfter: diskUsage(join(root, 'profiles')) };
    writeJson(join(root, 'runs', `${runId}.json`), result);
    controller.stdin.end();
  }
  if (failure) throw failure;
}

export async function settle(root: string) {
  const samples = await baseline(300);
  writeJson(join(root, 'runs', `settled-${Date.now()}.json`), { samples });
}
