import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { podman, inspect, rootLabel, label } from './container.js';
import { cgroupPath, terminated } from './runtime.js';
import { Ownership, readLease } from './ownership.js';
import { writeJson } from './storage.js';
import { defaults } from './config.js';
export function heartbeat(owner: Ownership, lost: (error: Error) => void): () => void {
  const timer = setInterval(() => {
    try { owner.renew(); } catch (error) { clearInterval(timer); lost(error as Error); }
  }, defaults.heartbeatMs);
  return () => clearInterval(timer);
}
export function reconcile(root: string): void {
  const leaseFiles = readdirSync(join(root, 'locks')).filter(f => f.endsWith('.json') && !f.endsWith('.counter.json'));
  for (const file of leaseFiles) {
    const path = join(root, 'locks', file); const lease = readLease(path);
    if (lease.state === 'stored' || lease.state === 'reauth-required') continue;
    lease.cancelled = true; lease.expires = 0; lease.state = 'stopping'; lease.reason = 'supervisor-reconciling';
    writeJson(path, lease);
    const attemptFile = join(root, 'attempts', lease.attempt, 'lease.json');
    if (existsSync(attemptFile)) writeJson(attemptFile, lease);
  }
  const names = podman(['ps', '-a', '--filter', `${'label'}=io.pasarpilot.root=${rootLabel(root)}`, '--format', '{{.Names}}']).split('\n').filter(Boolean);
  for (const name of names) {
    const record = inspect(name);
    if (record.Config.Labels[label] !== 'true') throw Error('foreign-container');
    const cg = record.State.Running ? cgroupPath(name) : undefined;
    if (record.State.Running) podman(['stop', '--time', '15', name]);
    if (!terminated(name, root, cg)) throw Error('termination-unproven');
  }
  for (const file of leaseFiles) {
    const path = join(root, 'locks', file); const lease = readLease(path);
    if (lease.state === 'stored' || lease.state === 'reauth-required') continue;
    if (!/^pasarpilot-[a-f0-9-]{36}$/.test(lease.container)) throw Error('invalid-recorded-owner');
    if (podman(['ps', '-q', '--filter', `name=^${lease.container}$`])) throw Error('termination-unproven');
    lease.cancelled = true; lease.expires = 0; lease.state = 'stored'; lease.reason = 'supervisor-reconciled';
    writeJson(path, lease);
    const attemptFile = join(root, 'attempts', lease.attempt, 'lease.json');
    if (existsSync(attemptFile)) writeJson(attemptFile, lease);
  }
}
