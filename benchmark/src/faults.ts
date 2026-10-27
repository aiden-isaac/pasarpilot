import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { initialise, writeJson } from './storage.js';
import { Ownership, holdLock, readLease } from './ownership.js';
import { Session } from './runtime.js';
import { fixtureOrigin, podman, inspect } from './container.js';
import { defaults } from './config.js';
import { admit, PressureGuard } from './metrics.js';
import { sampleHost } from './host.js';
import { actionGate, appendObservation, observations } from './events.js';
import { heartbeat, reconcile } from './recovery.js';

export async function faults(parent: string) {
  const root = initialise(join(parent, `faults-${Date.now()}`));
  const manifest = JSON.parse(readFileSync(join(parent, 'manifest.json'), 'utf8'));
  const controller = await holdLock(join(parent, 'locks', 'supervisor.lock'));
  const results: { name: string; passed: boolean; elapsedMs: number; forcedCleanup?: boolean; shutdownFailure?: string; error?: string }[] = [];
  let counter = 0, seeded = false, complete = false;
  const withSession = async (name: string, fn: (owner: Ownership, session: Session, visit: (inspectOnly?: boolean) => Promise<any>) => Promise<void>) => {
    const started = Date.now();
    console.log(JSON.stringify({ faultCase: name, state: 'starting' }));
    admit(sampleHost(), defaults.capBytes, 0, 1, 0, manifest.poolBudget);
    const owner = await Ownership.acquire(root, 'seller-a');
    const session = new Session(owner, defaults.capBytes, fixtureOrigin());
    let guardFailure: Error | undefined;
    const guard = new PressureGuard();
    const fail = (e: Error) => { guardFailure ??= e; void session.stop().catch(() => undefined); };
    const stopHeartbeat = heartbeat(owner, fail);
    const pressure = setInterval(() => { try { guard.check(sampleHost()); } catch (e) { fail(e as Error); } }, 1000);
    try {
      await session.ready; session.verifyLimits(defaults.capBytes);
      const visit = async (inspectOnly = false) => {
        const reply = await session.send({ op: inspectOnly ? 'verify' : 'visit', counter, seed: !seeded });
        seeded = true; counter = Number(reply.counter);
        appendObservation(owner, counter, Number(reply.events)); return reply;
      };
      await fn(owner, session, visit);
      if (guardFailure) throw guardFailure;
    } catch (error) {
      results.push({ name, passed: false, elapsedMs: Date.now() - started, error: error instanceof Error ? error.message : 'fault-test-failed' });
      throw error;
    } finally {
      clearInterval(pressure); stopHeartbeat();
      const dead = await session.stop();
      const actual = JSON.parse(readFileSync(owner.statePath, 'utf8'));
      if (actual.generation === owner.lease.generation && actual.state !== 'stored') await owner.release(dead, /reauth|history-unavailable/.test(owner.lease.reason ?? '') ? 'reauth-required' : 'stored');
      if (podman(['container', 'exists', owner.lease.container]) === '') podman(['rm', owner.lease.container]);
    }
    results.push({ name, passed: true, elapsedMs: Date.now() - started, forcedCleanup: session.forcedCleanup, shutdownFailure: session.shutdownFailure });
  };
  try {
    await withSession('seed-and-flush-before-crash', async (_owner, _session, visit) => { await visit(); });
    for (let i = 0; i < 5; i++) {
      await withSession(`crash-${i + 1}`, async (_owner, session, visit) => { await visit(true); assert.ok(await session.stop(true)); });
    }
    await withSession('restore-after-fifth-crash', async (_owner, _session, visit) => { await visit(); });
    await withSession('duplicate-and-expired-owner', async (owner, session, visit) => {
      await visit();
      await assert.rejects(Ownership.acquire(root, 'seller-a'), /profile-locked/);
      owner.lease.expires = Date.now() - 1; owner.persist();
      await assert.rejects(session.send({ op: 'visit', counter, seed: false }), /ownership-lost/);
      await assert.rejects(Ownership.acquire(root, 'seller-a'), /profile-locked/);
    });
    await withSession('cancellation', async (owner, session, visit) => {
      await visit(); owner.cancel('synthetic-revocation');
      await assert.rejects(session.send({ op: 'visit', counter, seed: false }), /ownership-lost/);
    });
    await withSession('history-unavailable-releases-capacity', async (owner, session, visit) => {
      await visit(); await session.send({ op: 'control', path: '/api/history', data: { locked: true } });
      await assert.rejects(visit(), /history-unavailable/);
      owner.cancel('history-unavailable');
    });
    assert.equal(readLease(join(root, 'locks', 'seller-a.json')).state, 'reauth-required');
    await withSession('explicit-history-recovery', async (_owner, session, visit) => {
      await session.send({ op: 'control', path: '/api/history', data: { locked: false } }); await visit();
    });
    await withSession('authentication-expiry-releases-capacity', async (owner, session, visit) => {
      await visit(); await session.send({ op: 'control', path: '/api/expire', data: {} });
      await assert.rejects(visit(), /reauth-required/);
      owner.cancel('reauth-required');
    });
    assert.equal(readLease(join(root, 'locks', 'seller-a.json')).state, 'reauth-required');
    await withSession('explicit-authentication-recovery', async (_owner, session, visit) => {
      await session.send({ op: 'control', path: '/seed/seller-a', data: {} }); await visit();
    });
    await withSession('uncertain-action', async (owner, session, visit) => {
      const reply = await visit(); const id = randomUUID();
      assert.throws(() => actionGate(owner, id, Number(reply.revision) - 1, Number(reply.revision)), /stale-action/);
      actionGate(owner, id, Number(reply.revision), Number(reply.revision));
      assert.equal((await session.send({ op: 'control', path: '/api/action', data: { id, revision: reply.revision } })).status, 200);
      assert.throws(() => actionGate(owner, id, Number(reply.revision), Number(reply.revision)), /reconciliation/);
    });
    await withSession('hung-worker-bounded-cleanup', async (_owner, session, visit) => {
      await visit(true);
      process.kill(inspect(session.owner.lease.container).State.Pid, 'SIGSTOP');
      const started = Date.now();
      assert.ok(await session.stop());
      assert.ok(session.forcedCleanup);
      assert.equal(session.shutdownFailure, 'shutdown-timeout');
      assert.ok(Date.now() - started < 40000, 'bounded cleanup exceeded 40 seconds');
    });
    await withSession('supervisor-reconciliation', async (owner, session, visit) => {
      await visit();
      owner.lock.stdin.end(); await once(owner.lock, 'exit');
      await assert.rejects(Ownership.acquire(root, 'seller-a'), /reconciliation/);
      reconcile(root);
      assert.ok(await session.stop());
      const next = await Ownership.acquire(root, 'seller-a');
      assert.ok(next.lease.generation > owner.lease.generation);
      assert.throws(() => appendObservation(owner, counter + 1, 400), /ownership-lost/);
      await next.release(true);
    });
    complete = true;
  } finally {
    writeJson(join(parent, 'runs', `faults-${Date.now()}.json`), { complete, results, browserFreeEvents: observations(root).length });
    controller.stdin.end();
  }
  console.log(JSON.stringify({ faultsPassed: results.filter(r => r.passed).length, root }));
}
