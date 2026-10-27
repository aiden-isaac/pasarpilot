import assert from 'node:assert/strict';
import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { readFileSync, writeFileSync, readdirSync, rmSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { initialise, writeJson } from './storage.js';
import { Ownership, holdLock } from './ownership.js';
import { Session, cgroupPath, terminated } from './runtime.js';
import { fixtureOrigin, podman, inspect, label, rootLabel } from './container.js';
import { heartbeat } from './recovery.js';
import { admit, sampleAttempt, PressureGuard, allowance } from './metrics.js';
import { sampleHost, minecraftPids } from './host.js';

export async function interactive(parent: string) {
  const manifest = JSON.parse(readFileSync(join(parent, 'manifest.json'), 'utf8'));
  const root = initialise(join(parent, `interactive-${Date.now()}`));
  const controller = await holdLock(join(parent, 'locks', 'supervisor.lock'));
  const cap = 2 * 1024 ** 3;
  const phaseWindowMs = 15000;
  const samples: { phase: string; host: ReturnType<typeof sampleHost>; resources: ReturnType<typeof sampleAttempt> }[] = [];
  const checks: string[] = [];
  const holds: { phase: string; started: number; ended: number }[] = [];
  const transitions: { mode: string; elapsedMs: number }[] = [];
  const viewerSamples: ReturnType<typeof sampleAttempt>[] = [];
  let viewerName: string | undefined, viewerCgroup: string | undefined;
  const backgroundSamples: ReturnType<typeof sampleAttempt>[] = [];
  let background: { owner: Ownership; session: Session; stopHeartbeat: () => void } | undefined;
  let phase = 'starting', owner: Ownership | undefined, session: Session | undefined;
  let error: string | undefined, stopHeartbeat: (() => void) | undefined;
  let viewer: ChildProcessWithoutNullStreams | undefined;
  const guard = new PressureGuard();
  const stop = async () => {
    phase = 'stopping';
    const started = Date.now();
    let failure: Error | undefined;
    try {
      if (viewer) { viewer.stdin.end(); await Promise.race([once(viewer, 'exit'), delay(5000)]); viewer = undefined; }
      if (viewerName && podman(['ps', '-a', '-q', '--filter', `name=^${viewerName}$`])) {
        const cg = viewerCgroup; viewerCgroup = undefined;
        if (inspect(viewerName).State.Running) await promisify(execFile)('podman', ['stop', '--time', '15', viewerName], { timeout: 20000 });
        if (!terminated(viewerName, root, cg)) throw Error('viewer-termination-unproven');
        podman(['rm', viewerName]); viewerName = undefined;
      }
    } catch (e) { failure = e as Error; }
    try {
      if (background) {
        const item = background; background = undefined;
        const dead = await item.session.stop(); item.stopHeartbeat();
        if (!dead) throw Error('background-termination-unproven');
        await item.owner.release(true); podman(['rm', item.owner.lease.container]);
      }
    } catch (e) { failure ??= e as Error; }
    try {
      if (session && owner) {
        const item = session; session = undefined;
        const dead = await item.stop(); stopHeartbeat?.();
        if (!dead) throw Error('termination-unproven');
        for (const name of ['view.json', 'vnc-password']) rmSync(join(owner.attemptPath, name), { force: true });
        await owner.release(true); podman(['rm', owner.lease.container]); owner = undefined;
        transitions.push({ mode: 'stopped', elapsedMs: Date.now() - started });
      }
    } catch (e) { failure ??= e as Error; }
    if (failure) throw failure;
  };
  const start = async (headed: boolean) => {
    phase = headed ? 'headed-starting' : 'headless-starting';
    const started = Date.now();
    admit(sampleHost(), cap, 0, 1, 0, manifest.poolBudget);
    owner = await Ownership.acquire(root, 'seller-a'); session = new Session(owner, cap, fixtureOrigin(), headed);
    stopHeartbeat = heartbeat(owner, e => { error ??= e.message; void session?.stop().catch(() => undefined); });
    await session.ready; session.verifyLimits(cap);
    transitions.push({ mode: phase, elapsedMs: Date.now() - started });
  };
  const collect = () => {
    try {
      const host = sampleHost(); guard.check(host);
      if (minecraftPids().length) throw Error('minecraft-restarted');
      if (viewerCgroup) {
        const resources = sampleAttempt(viewerCgroup);
        if (resources.events?.oom || resources.events?.oom_kill || resources.swapMax !== 0) throw Error('viewer-resource-failure');
        viewerSamples.push(resources);
      }
      if (background?.session.cgroup) {
        const resources = sampleAttempt(background.session.cgroup);
        if (resources.events?.oom || resources.events?.oom_kill) throw Error('background-resource-failure');
        backgroundSamples.push(resources);
      }
      if (session?.cgroup) {
        const resources = sampleAttempt(session.cgroup);
        if (resources.events?.oom || resources.events?.oom_kill || resources.swapMax !== 0) throw Error('attempt-resource-failure');
        samples.push({ phase, host, resources });
      }
    } catch (e) { error ??= (e as Error).message; void session?.stop().catch(() => undefined); }
  };
  const collector = setInterval(collect, 1000);
  const hold = async (name: string, ms = phaseWindowMs) => {
    phase = name; const started = Date.now();
    await delay(ms); collect(); holds.push({ phase, started, ended: Date.now() });
    if (error) throw Error(error);
  };
  try {
    if (minecraftPids().length) throw Error('minecraft-running');
    await start(false); await session!.send({ op: 'visit', counter: 0, seed: true });
    await hold('headless'); await stop(); checks.push('headless-clean-release');
    await start(true); await session!.send({ op: 'verify', counter: 0, seed: false });
    await hold('headed-no-vnc');
    owner!.lease.state = 'interactive'; owner!.persist();
    await assert.rejects(session!.send({ op: 'visit', counter: 0 }), /interactive-control-exclusive/);
    checks.push('same-profile-handoff-and-exclusive-control');
    const password = randomBytes(4).toString('hex');
    writeJson(join(owner!.attemptPath, 'view.json'), { password });
    writeFileSync(join(owner!.attemptPath, 'vnc-password'), password + '\n', { mode: 0o600 });
    phase = 'novnc-starting';
    podman(['exec', '-e', 'XAUTHORITY=/tmp/Xauthority', owner!.lease.container, 'sh', '-c',
      'x11vnc -display "$(cat /tmp/display)" -passwdfile /attempt/vnc-password -localhost -rfbport 5900 -forever -shared -bg -o /tmp/vnc.log && websockify --daemon --web=/usr/share/novnc 127.0.0.1:6080 127.0.0.1:5900']);
    await hold('novnc-zero-viewer');
    const primaryNames = readdirSync(join(parent, 'runs')).filter(n => /^(continuous|rotation)-\d+\.json$/.test(n));
    const backgroundCap = allowance(Math.max(...primaryNames.map(n => JSON.parse(readFileSync(join(parent, 'runs', n), 'utf8')).peak)));
    admit(sampleHost(), backgroundCap, 1, 3, cap, manifest.poolBudget);
    phase = 'viewer-starting'; viewerName = `pasarpilot-viewer-${owner!.lease.attempt}`;
    viewer = spawn('podman', ['run', '--http-proxy=false', '-i', '--name', viewerName,
      '--label', `${label}=true`, '--label', `io.pasarpilot.root=${rootLabel(root)}`,
      '--network', `container:${owner!.lease.container}`, '--userns', 'keep-id', '--user', `${process.getuid!()}:${process.getgid!()}`,
      '--cap-drop', 'all', '--security-opt', `seccomp=${resolve('seccomp.json')}`,
      '--memory', String(backgroundCap), '--memory-swap', String(backgroundCap), '--cpus', '2', '--pids-limit', '256',
      '--read-only', '--shm-size', '128m', '--tmpfs', '/tmp:rw,nosuid,nodev,size=128m',
      '-v', `${owner!.attemptPath}:/attempt:ro`, '-e', 'HOME=/tmp/home', '--entrypoint', 'sh',
      'localhost/pasarpilot-benchmark:v1', '-c', 'mkdir -p /tmp/home && exec node dist/src/viewer.js']);
    let viewerDiagnostic = '';
    const viewerLog = join(owner!.attemptPath, 'viewer.stderr.log');
    viewer.stderr.on('data', data => {
      const safe = String(data).replaceAll(password, '[redacted]');
      viewerDiagnostic = (viewerDiagnostic + safe).slice(-8000);
      appendFileSync(viewerLog, safe, { mode: 0o600 });
    });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('viewer-start-timeout')), 30000);
      viewer!.once('exit', () => { clearTimeout(timeout); reject(Error(`viewer-exited: ${viewerDiagnostic.slice(-2000)}`)); });
      viewer!.stdout.once('data', data => { clearTimeout(timeout); if (JSON.parse(String(data)).connected) resolve(); else reject(Error('viewer-not-connected')); });
    });
    const viewerRecord = inspect(viewerName);
    assert.equal(viewerRecord.HostConfig.Memory, backgroundCap);
    assert.equal(viewerRecord.HostConfig.MemorySwap, backgroundCap);
    assert.equal(Object.keys(viewerRecord.HostConfig.PortBindings ?? {}).length, 0);
    viewerCgroup = cgroupPath(viewerName); assert.ok(viewerCgroup);
    await hold('novnc-one-viewer');
    phase = 'background-starting';
    admit(sampleHost(), backgroundCap, 2, 3, cap + backgroundCap, manifest.poolBudget);
    const backgroundOwner = await Ownership.acquire(root, 'seller-b');
    const backgroundSession = new Session(backgroundOwner, backgroundCap, fixtureOrigin());
    background = { owner: backgroundOwner, session: backgroundSession,
      stopHeartbeat: heartbeat(backgroundOwner, e => { error ??= e.message; void backgroundSession.stop().catch(() => undefined); }) };
    await backgroundSession.ready; backgroundSession.verifyLimits(backgroundCap);
    await backgroundSession.send({ op: 'visit', counter: 0, seed: true });
    await hold('interactive-plus-background', 5000);
    checks.push('distinct-profile-background-plus-interactive');
    await stop(); checks.push('explicit-interactive-release');
    // Test accelerated inactivity and absolute-deadline release using the same verified shutdown path.
    for (const reason of ['inactivity', 'deadline']) {
      await start(true); owner!.lease.state = 'interactive'; owner!.persist();
      await hold(reason, 3000); await stop(); checks.push(`${reason}-termination-verified`);
    }
    await start(false); await session!.send({ op: 'verify', counter: 0, seed: false }); await stop();
    checks.push('returned-to-headless-with-persistence');
  } catch (e) { error ??= (e as Error).message; }
  finally {
    clearInterval(collector);
    try { await stop(); } catch (e) { error ??= (e as Error).message; }
    writeJson(join(parent, 'runs', `interactive-${Date.now()}.json`), { root, cap, phaseWindowMs, complete: !error, error, checks, holds, transitions, samples, backgroundSamples, viewerSamples,
      image: inspect('localhost/pasarpilot-benchmark-interactive:v1').Id,
      viewerAccounting: 'Real noVNC client in a separate 576 MiB-capped container/cgroup, no seller profile. It joins only the display network namespace for loopback access. Client memory is reported separately; normally borne by seller device. All three containers are included in admission and no ports are published.' });
    controller.stdin.end();
  }
  console.log(JSON.stringify({ interactiveComplete: !error, checks, error }));
  if (error) throw Error(error);
}
