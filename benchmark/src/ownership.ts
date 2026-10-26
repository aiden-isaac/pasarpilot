import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, readFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { initialise, privateDir, profilePath, writeJson } from './storage.js';
import { defaults } from './config.js';

export type Lease = { schemaVersion: 1; tenant: string; generation: number; attempt: string;
  container: string; expires: number; cancelled: boolean; state: string; reason?: string };
export function readLease(path: string): Lease { return JSON.parse(readFileSync(path, 'utf8')); }
export function assertLease(actual: Lease, expected: Pick<Lease, 'attempt' | 'generation'>, now = Date.now()): void {
  if (actual.attempt !== expected.attempt || actual.generation !== expected.generation || actual.cancelled || actual.expires <= now) throw Error('ownership-lost');
}
export async function holdLock(path: string): Promise<ChildProcessWithoutNullStreams> {
  const lock = spawn('flock', ['-n', '-E', '73', path, 'sh', '-c', 'printf "locked\\n"; cat >/dev/null']);
  await new Promise<void>((resolve, reject) => {
    lock.once('error', reject); lock.once('exit', () => reject(Error('profile-locked')));
    lock.stdout.once('data', () => resolve());
  });
  chmodSync(path, 0o600); return lock;
}
export class Ownership {
  private constructor(readonly root: string, readonly lease: Lease, readonly lock: ChildProcessWithoutNullStreams,
    readonly statePath: string, readonly attemptPath: string) {}
  static async acquire(root: string, tenant: string): Promise<Ownership> {
    initialise(root); profilePath(root, tenant);
    const lockPath = join(root, 'locks', `${tenant}.lock`);
    const lock = await holdLock(lockPath);
    const statePath = join(root, 'locks', `${tenant}.json`);
    const previous = existsSync(statePath) ? readLease(statePath) : undefined;
    // Expiration alone never proves the old container is dead: the caller must reconcile first.
    if (previous && previous.state !== 'stored' && previous.state !== 'reauth-required') {
      lock.stdin.end(); throw Error('profile-needs-reconciliation');
    }
    const attempt = randomUUID();
    const lease: Lease = { schemaVersion: 1, tenant, generation: (previous?.generation ?? 0) + 1,
      attempt, container: `pasarpilot-${attempt}`, expires: Date.now() + defaults.leaseMs,
      cancelled: false, state: 'starting' };
    const attemptPath = privateDir(join(root, 'attempts', attempt));
    const owner = new Ownership(root, lease, lock, statePath, attemptPath);
    owner.persist(); return owner;
  }
  persist(): void {
    writeJson(this.statePath, this.lease); writeJson(join(this.attemptPath, 'lease.json'), this.lease);
  }
  check(): void { assertLease(readLease(this.statePath), this.lease); }
  renew(): void { this.check(); this.lease.expires = Date.now() + defaults.leaseMs; this.persist(); }
  cancel(reason: string): void {
    this.check(); this.lease.cancelled = true; this.lease.reason = reason; this.lease.state = 'stopping'; this.persist();
  }
  async release(terminated: boolean, state = 'stored'): Promise<void> {
    if (!terminated) throw Error('termination-unproven');
    const actual = readLease(this.statePath);
    if (actual.attempt !== this.lease.attempt || actual.generation !== this.lease.generation) throw Error('ownership-lost');
    this.lease.state = state; this.lease.expires = 0; this.persist();
    await new Promise<void>(resolve => { this.lock.once('exit', () => resolve()); this.lock.stdin.end(); });
  }
}
