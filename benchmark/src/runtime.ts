import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
import { appendFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { defaults } from './config.js';
import { sampleAttempt } from './metrics.js';
import { profilePath, writeJson } from './storage.js';
import { Ownership, readLease, assertAutomation } from './ownership.js';
import { podman, inspect, rootLabel, label } from './container.js';
export type Reply = { id?: string; ready?: boolean; error?: string; [key: string]: unknown };
export function cgroupPath(name: string): string | undefined {
  const pid = inspect(name).State.Pid;
  if (!pid) return undefined;
  const line = readFileSync(`/proc/${pid}/cgroup`, 'utf8').split('\n').find(l => l.startsWith('0::'));
  if (!line) throw Error('cgroup-v2-required');
  return join('/sys/fs/cgroup', line.slice(3));
}
export function terminated(name: string, root: string, cg?: string): boolean {
  const record = inspect(name);
  if (record.Config.Labels[label] !== 'true' || record.Config.Labels['io.pasarpilot.root'] !== rootLabel(root)) throw Error('foreign-container');
  if (record.State.Running || record.State.Pid) return false;
  if (cg && existsSync(join(cg, 'cgroup.procs')) && readFileSync(join(cg, 'cgroup.procs'), 'utf8').trim()) return false;
  return true;
}
export class Session {
  private pending = new Map<string, { resolve: (r: Reply) => void; reject: (e: Error) => void }>();
  readonly child: ChildProcessWithoutNullStreams;
  readonly ready: Promise<Reply>;
  cgroup?: string;
  forcedCleanup = false;
  shutdownFailure?: string;
  finalResources?: ReturnType<typeof sampleAttempt>;
  private stopping?: Promise<boolean>;
  constructor(readonly owner: Ownership, capBytes: number, origin: string, headed = false, beforeOperation?: () => Promise<void>) {
    const args = ['run', '--http-proxy=false', '-i', '--name', owner.lease.container,
      '--label', `${label}=true`, '--label', `io.pasarpilot.root=${rootLabel(owner.root)}`,
      '--network', 'pasarpilot-benchmark', '--userns', 'keep-id', '--user', `${process.getuid!()}:${process.getgid!()}`,
      '--cap-drop', 'all', '--security-opt', `seccomp=${resolve('seccomp.json')}`,
      '--memory', String(capBytes), '--memory-swap', String(capBytes), '--cpus', '2', '--shm-size', '128m',
      '--pids-limit', '256', '--read-only', '--tmpfs', '/tmp:rw,nosuid,nodev,size=128m',
      '-v', `${profilePath(owner.root, owner.lease.tenant)}:/profile:rw`,
      '-v', `${owner.attemptPath}:/attempt:ro`, '-e', `FIXTURE_ORIGIN=${origin}`, '-e', `HEADED=${headed}`,
      '-e', 'HOME=/tmp/home', '-e', 'XDG_CONFIG_HOME=/tmp/home/.config', '-e', 'XDG_CACHE_HOME=/tmp/home/.cache',
      ...(headed ? ['--init', '--tmpfs', '/tmp/.X11-unix:rw,nosuid,nodev,mode=1777,size=1m', '--entrypoint', 'xvfb-run', 'localhost/pasarpilot-benchmark-interactive:v1', '-a', '-f', '/tmp/Xauthority', '-e', '/dev/stderr', '-s', '-screen 0 1280x720x24', 'node'] : ['localhost/pasarpilot-benchmark:v1']), 'dist/src/worker.js'];
    this.child = spawn('podman', args);
    this.child.stdin.on('error', e => { for (const p of this.pending.values()) p.reject(e); this.pending.clear(); });
    this.ready = new Promise((resolveReady, rejectReady) => {
      const startupMetrics = setInterval(() => {
        try {
          this.cgroup ??= cgroupPath(owner.lease.container);
          if (this.cgroup) writeJson(join(owner.attemptPath, 'startup-metrics.json'), sampleAttempt(this.cgroup));
        } catch { /* The container may not exist yet or may already have terminated. */ }
      }, 250);
      const timer = setTimeout(() => rejectReady(Error('startup-timeout')), defaults.visitTimeoutMs);
      this.child.once('error', e => { clearTimeout(timer); rejectReady(e); });
      // Synthetic-only stderr is retained locally by callers; it never contains profile dumps.
      let stderr = '';
      this.child.stderr.on('data', d => {
        appendFileSync(join(owner.attemptPath, 'stderr.log'), d, { mode: 0o600 });
        stderr = (stderr + d.toString()).slice(0, 131072);
      });
      this.child.once('exit', code => {
        clearInterval(startupMetrics);
        const diagnostic = stderr.split('\n').filter(l => !l.includes('<launching>') && !l.includes('Call log') && /FATAL|ERROR|Operation not permitted|Permission denied|zygote.*failed|No usable sandbox|Assertion|Error:/.test(l)).slice(0, 15).join('\n');
        clearTimeout(timer); const error = Error(`worker-exited-${code}: ${diagnostic.slice(0, 2000) || stderr.slice(-1000)}`);
        rejectReady(error); for (const p of this.pending.values()) p.reject(error); this.pending.clear();
      });
      createInterface({ input: this.child.stdout }).on('line', line => {
        try {
          const value = JSON.parse(line) as Reply;
          if (value.guard === true && typeof value.guardId === 'string') {
            const guardId = value.guardId;
            void Promise.resolve().then(async () => {
              if (!beforeOperation) throw Error('operation-guard-unavailable');
              await beforeOperation(); this.owner.check();
            }).then(() => this.child.stdin.write(JSON.stringify({ guardId }) + '\n'),
              error => this.child.stdin.write(JSON.stringify({ guardId, error: error instanceof Error ? error.message : 'operation-rejected' }) + '\n'));
          } else if (value.ready) { clearInterval(startupMetrics); clearTimeout(timer); resolveReady(value); }
          else if (value.id) {
            const p = this.pending.get(value.id); this.pending.delete(value.id);
            if (value.error) p?.reject(Error(value.error)); else p?.resolve(value);
          }
        } catch { rejectReady(Error('invalid-worker-protocol')); }
      });
    });
  }
  async send(command: Record<string, unknown>, closing = false): Promise<Reply> {
    if (!closing) {
      this.owner.check();
      if (command.op === 'visit' || command.op === 'verify') assertAutomation(readLease(this.owner.statePath));
    }
    const id = randomUUID();
    return new Promise((resolveReply, reject) => {
      const timeout = setTimeout(() => { this.pending.delete(id); reject(Error('visit-timeout')); }, defaults.visitTimeoutMs);
      this.pending.set(id, { resolve: value => { clearTimeout(timeout); resolveReply(value); }, reject: e => { clearTimeout(timeout); reject(e); } });
      this.child.stdin.write(JSON.stringify({ ...command, id }) + '\n', e => { if (e) { clearTimeout(timeout); this.pending.delete(id); reject(e); } });
    });
  }
  verifyLimits(capBytes: number): void {
    const record = inspect(this.owner.lease.container);
    if (record.HostConfig.Memory !== capBytes || record.HostConfig.MemorySwap !== capBytes ||
        Object.keys(record.HostConfig.PortBindings ?? {}).length) throw Error('resource-controls-unverified');
    this.cgroup = cgroupPath(this.owner.lease.container);
    if (!this.cgroup) throw Error('missing-attempt-cgroup');
  }
  stop(crash = false): Promise<boolean> { return this.stopping ??= this.stopOnce(crash); }
  private async stopOnce(crash: boolean): Promise<boolean> {
    const name = this.owner.lease.container;
    if (!inspect(name).State.Running) return terminated(name, this.owner.root, this.cgroup);
    if (crash) { this.forcedCleanup = true; podman(['kill', '--signal', 'KILL', name]); }
    else {
      try { await Promise.race([
        this.send({ op: 'close' }, true).then(reply => { this.finalResources = reply.resources as ReturnType<typeof sampleAttempt>; }),
        new Promise((_, reject) => setTimeout(() => reject(Error('shutdown-timeout')), defaults.shutdownMs).unref()),
      ]); }
      catch (e) { this.forcedCleanup = true; this.shutdownFailure = (e as Error).message; }
      if (inspect(name).State.Running) await promisify(execFile)('podman', ['stop', '--time', '15', name], { timeout: 20_000, maxBuffer: 1024 * 1024 });
    }
    return terminated(name, this.owner.root, this.cgroup);
  }
}
