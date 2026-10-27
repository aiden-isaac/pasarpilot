import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { defaults } from './config.js';
import { Ownership, holdLock } from './ownership.js';
import { Session } from './runtime.js';
import { fixtureOrigin, podman } from './container.js';
import { admit, sampleAttempt } from './metrics.js';
import { sampleHost } from './host.js';
import { initialise, writeJson } from './storage.js';

export async function smoke(root: string): Promise<void> {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  const smokeId = String(Date.now());
  const smokeRoot = initialise(join(root, 'smoke', smokeId));
  const controller = await holdLock(join(root, 'locks', 'supervisor.lock'));
  let counter = 0;
  try {
  for (let i = 0; i < 2; i++) {
    admit(sampleHost(), defaults.capBytes, 0, 1, 0, manifest.poolBudget);
    const owner = await Ownership.acquire(smokeRoot, 'seller-a');
    const session = new Session(owner, defaults.capBytes, fixtureOrigin());
    const heartbeat = setInterval(() => owner.renew(), defaults.heartbeatMs);
    try {
      const ready = await session.ready;
      session.verifyLimits(defaults.capBytes);
      const reply = await session.send({ op: 'visit', counter, seed: i === 0 });
      assert.equal(reply.tenant, 'seller-a'); counter = Number(reply.counter);
      assert.equal(counter, i);
      writeJson(join(root, 'runs', `smoke-${smokeId}-${i}.json`), { ready, reply, sample: sampleAttempt(session.cgroup!) });
      console.log(JSON.stringify({ smokeVisit: i + 1, sandbox: ready.sandbox, counter }));
    } catch (error) {
      writeJson(join(root, 'runs', `smoke-failure-${Date.now()}.json`), {
        attempt: owner.lease.attempt, error: error instanceof Error ? error.message : 'smoke-failed',
        sandboxVerified: false, host: sampleHost(), capBytes: defaults.capBytes,
      });
      throw error;
    } finally {
      clearInterval(heartbeat);
      const dead = await session.stop(); await owner.release(dead);
      podman(['rm', owner.lease.container]);
    }
  }
  } finally { controller.stdin.end(); }
}
