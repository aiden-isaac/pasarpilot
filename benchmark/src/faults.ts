import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { initialise, writeJson } from './storage.js';
import { Ownership, holdLock } from './ownership.js';
import { Session } from './runtime.js';
import { fixtureOrigin, podman } from './container.js';
import { defaults } from './config.js';
import { admit } from './metrics.js';
import { sampleHost } from './host.js';
import { actionGate, appendObservation, observations } from './events.js';
import { heartbeat, reconcile } from './recovery.js';

export async function faults(parent: string) {
  const root = initialise(join(parent, `faults-${Date.now()}`));
  const manifest = JSON.parse(readFileSync(join(parent, 'manifest.json'), 'utf8'));
  const controller = await holdLock(join(parent, 'locks', 'supervisor.lock'));
  const results: { name: string; passed: boolean; error?: string }[] = [];
  let counter = 0, seeded = false;
  const withSession = async (name: string, fn: (owner: Ownership, session: Session, visit: (inspectOnly?: boolean) => Promise<any>) => Promise<void>) => {
    console.log(JSON.stringify({ faultCase: name, state: 'starting' }));
    admit(sampleHost(), defaults.capBytes, 0, 1, 0, manifest.poolBudget);
    const owner = await Ownership.acquire(root, 'seller-a');
    const session = new Session(owner, defaults.capBytes, fixtureOrigin());
    const stopHeartbeat = heartbeat(owner, () => { void session.stop().catch(() => undefined); });
    try {
      await session.ready; session.verifyLimits(defaults.capBytes);
      const visit = async (inspectOnly = false) => {
        const reply = await session.send({ op: inspectOnly ? 'verify' : 'visit', counter, seed: !seeded });
        seeded = true; counter = Number(reply.counter);
        appendObservation(owner, counter, Number(reply.events)); return reply;
      };
      await fn(owner, session, visit);
      results.push({ name, passed: true });
    } catch (error) {
      results.push({ name, passed: false, error: error instanceof Error ? error.message : 'fault-test-failed' });
      throw error;
    } finally {
      stopHeartbeat();
      const dead = await session.stop();
      const actual = JSON.parse(readFileSync(owner.statePath, 'utf8'));
      if (actual.generation === owner.lease.generation && actual.state !== 'stored') await owner.release(dead);
      if (podman(['container', 'exists', owner.lease.container]) === '') podman(['rm', owner.lease.container]);
    }
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
    await withSession('history-and-explicit-recovery', async (_owner, session, visit) => {
      await visit(); await session.send({ op: 'control', path: '/api/history', data: { locked: true } });
      await assert.rejects(visit(), /history-unavailable/);
      await session.send({ op: 'control', path: '/api/history', data: { locked: false } }); await visit();
    });
    await withSession('authentication-and-explicit-recovery', async (_owner, session, visit) => {
      await visit(); await session.send({ op: 'control', path: '/api/expire', data: {} });
      await assert.rejects(visit(), /reauth-required/);
      await session.send({ op: 'control', path: '/seed/seller-a', data: {} }); await visit();
    });
    await withSession('uncertain-action', async (owner, session, visit) => {
      const reply = await visit(); const id = randomUUID();
      assert.throws(() => actionGate(owner, id, Number(reply.revision) - 1, Number(reply.revision)), /stale-action/);
      actionGate(owner, id, Number(reply.revision), Number(reply.revision));
      assert.equal((await session.send({ op: 'control', path: '/api/action', data: { id, revision: reply.revision } })).status, 200);
      assert.throws(() => actionGate(owner, id, Number(reply.revision), Number(reply.revision)), /reconciliation/);
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
  } finally {
    writeJson(join(parent, 'runs', `faults-${Date.now()}.json`), { results, browserFreeEvents: observations(root).length });
    controller.stdin.end();
  }
  console.log(JSON.stringify({ faultsPassed: results.filter(r => r.passed).length, root }));
}
