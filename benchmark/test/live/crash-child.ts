import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SchedulerStore } from '../../src/scheduler-store.js';
import { executeJob } from '../../src/scheduler.js';
import { Ownership, holdLock } from '../../src/ownership.js';
import { Session } from '../../src/runtime.js';
import { heartbeat } from '../../src/recovery.js';
import { fixtureOrigin, inspect } from '../../src/container.js';
import { defaults } from '../../src/config.js';
import { inspectVisit } from '../../src/visit.js';
import { writeJson } from '../../src/storage.js';
import { admit, PressureGuard, sampleAttempt } from '../../src/metrics.js';
import { sampleHost } from '../../src/host.js';

const [root, socket, parent, boundary] = process.argv.slice(2) as [string,string,string,string];
const store = await SchedulerStore.open(root, false, 120000, socket);
const manifest = JSON.parse(readFileSync(join(parent, 'manifest.json'), 'utf8'));
await holdLock(join(root, 'locks', 'supervisor.lock'));
await store.tick();
const job = (await store.claim())!;
if (!job) throw Error('fault-job-required');
let container: string | undefined;
if (boundary === 'release') {
  await executeJob(store, job, manifest);
} else if (boundary !== 'claim') {
  admit(sampleHost(), defaults.capBytes, 0, 1, 0, manifest.poolBudget);
  const owner = await Ownership.acquire(root, job.data.tenant);
  await store.attach(job, { attempt: owner.lease.attempt, generation: owner.lease.generation });
  writeJson(join(owner.attemptPath, 'job.json'), { id: job.id, name: job.name, retryCount: job.retryCount, data: job.data });
  const session = new Session(owner, defaults.capBytes, fixtureOrigin());
  heartbeat(owner, () => { void session.stop(); });
  const guard = new PressureGuard();
  setInterval(() => {
    try {
      guard.check(sampleHost());
      if (session.cgroup) {
        const resources = sampleAttempt(session.cgroup);
        if (!resources.memory || resources.events?.oom || resources.events?.oom_kill) throw Error('fault-child-resource-failure');
      }
    } catch (error) { owner.cancel((error as Error).message); void session.stop(); }
  }, 1000);
  await session.ready; session.verifyLimits(defaults.capBytes);
  if (boundary === 'flush') await inspectVisit(owner, session, () => store.check(job));
  else {
    const counter = JSON.parse(readFileSync(join(root, 'locks', `${job.data.tenant}.counter.json`), 'utf8')).counter;
    await session.send({ op: 'verify', seed: false, counter });
    process.kill(inspect(owner.lease.container).State.Pid, 'SIGSTOP');
  }
  container = owner.lease.container;
}
process.stdout.write(JSON.stringify({ boundary, job: job.id, tenant: job.data.tenant, container }) + '\n', () => process.kill(process.pid, 'SIGKILL'));
