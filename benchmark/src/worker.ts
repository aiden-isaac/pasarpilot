import { chromium, type BrowserContext } from 'playwright';
import { createInterface } from 'node:readline';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { assertLease, assertAutomation, type Lease } from './ownership.js';
import { verifySandbox } from './sandbox.js';
import { sampleAttempt } from './metrics.js';

const leaseFile = '/attempt/lease.json';
const expected: Lease = JSON.parse(readFileSync(leaseFile, 'utf8'));
const check = () => assertLease(JSON.parse(readFileSync(leaseFile, 'utf8')), expected);
const input = createInterface({ input: process.stdin });
const guards = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();
input.on('line', line => {
  const reply = JSON.parse(line);
  if (typeof reply.guardId !== 'string') return;
  const pending = guards.get(reply.guardId); guards.delete(reply.guardId);
  if (reply.error) pending?.reject(Error(reply.error)); else pending?.resolve();
});
async function checkpoint() {
  check();
  if (expected.operationGuard) await new Promise<void>((resolve, reject) => {
    const guardId = randomUUID();
    const timer = setTimeout(() => { guards.delete(guardId); reject(Error('operation-guard-timeout')); }, 10_000);
    guards.set(guardId, { resolve: () => { clearTimeout(timer); resolve(); }, reject: error => { clearTimeout(timer); reject(error); } });
    console.log(JSON.stringify({ guard: true, guardId }));
  });
  check();
}
const origin = process.env.FIXTURE_ORIGIN!;
if (!origin || process.getuid?.() === 0) throw Error('unsafe-worker');
mkdirSync('/tmp/home', { recursive: true, mode: 0o700 });
if (process.env.DISPLAY) writeFileSync('/tmp/display', process.env.DISPLAY, { mode: 0o600 });
let context: BrowserContext | undefined;
const launch = performance.now();
async function close() { await context?.close(); context = undefined; }
process.on('SIGTERM', () => { void close().finally(() => process.exit()); });
try {
  await checkpoint();
  context = await chromium.launchPersistentContext('/profile', {
    headless: process.env.HEADED !== 'true', channel: 'chromium', chromiumSandbox: true,
    timeout: 60_000, acceptDownloads: false,
  });
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto('chrome://sandbox');
  await page.waitForFunction(() => document.body.innerText.includes('Seccomp'), undefined, { timeout: 10_000 });
  const sandbox = await page.locator('body').innerText();
  verifySandbox(sandbox);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === origin ? route.continue() : route.abort('blockedbyclient');
  });
  console.log(JSON.stringify({ ready: true, startupMs: performance.now() - launch, sandbox: true }));
  for await (const line of input) {
    const command = JSON.parse(line);
    if (command.guardId) continue;
    try {
      if (command.op === 'close') {
        await close();
        console.log(JSON.stringify({ id: command.id, closed: true, resources: sampleAttempt('/sys/fs/cgroup') }));
        break;
      }
      await checkpoint();
      if (command.op === 'state' || command.op === 'action-status' || command.op === 'action') {
        assertAutomation(JSON.parse(readFileSync(leaseFile, 'utf8')));
        if (command.op !== 'state' && (typeof command.actionId !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(command.actionId))) throw Error('invalid-action-id');
        const stateResponse = await context.request.get(`${origin}/api/state`);
        if (stateResponse.status() === 401) throw Error('reauth-required');
        if (stateResponse.status() !== 200) throw Error('fixture-unavailable');
        const state = await stateResponse.json();
        if (state.tenant !== expected.tenant) throw Error('isolation-failure');
        if (!state.historyReady) throw Error('history-unavailable');
        await checkpoint();
        if (command.op === 'state') { console.log(JSON.stringify({ id: command.id, ...state })); continue; }
        if (command.op === 'action' && command.expectedRevision !== state.revision) throw Error('stale-action');
        const response = command.op === 'action-status'
          ? await context.request.get(`${origin}/api/actions/${command.actionId}`)
          : await context.request.post(`${origin}/api/action`, { data: { id: command.actionId, revision: command.expectedRevision } });
        await checkpoint();
        console.log(JSON.stringify({ id: command.id, status: response.status(), result: await response.json() })); continue;
      }
      if (command.op === 'control') {
        if (typeof command.path !== 'string' || !/^\/(api\/(history|expire|action)|seed\/seller-[abc])$/.test(command.path)) throw Error('invalid-control-path');
        const response = await context.request.post(origin + command.path, { data: command.data });
        console.log(JSON.stringify({ id: command.id, status: response.status(), result: await response.json() })); continue;
      }
      if (command.op !== 'visit' && command.op !== 'verify') throw Error('unknown-operation');
      assertAutomation(JSON.parse(readFileSync(leaseFile, 'utf8')));
      const restoration = performance.now();
      if (command.seed) {
        const response = await context.request.post(`${origin}/seed/${expected.tenant}`);
        if (response.status() !== 200) throw Error('seed-failed');
      }
      await checkpoint();
      const response = await context.request.get(`${origin}/api/state`);
      if (response.status() === 401) throw Error('reauth-required');
      if (response.status() !== 200) throw Error('fixture-unavailable');
      const state = await response.json();
      if (state.tenant !== expected.tenant) throw Error('isolation-failure');
      if (!state.historyReady) throw Error('history-unavailable');
      await checkpoint();
      await page.goto(`${origin}/target/1`, { waitUntil: 'load', timeout: 30_000 });
      await page.waitForFunction(() => 'fixtureStorage' in window);
      await checkpoint();
      const counter = await page.evaluate(async ({ tenant, counter, seed, inspectOnly }) => {
        const fn = (window as unknown as { fixtureStorage: (t: string, n: number, s: boolean, v: boolean) => Promise<number> }).fixtureStorage;
        return fn(tenant, counter, seed, inspectOnly);
      }, { tenant: expected.tenant, counter: command.counter, seed: !!command.seed, inspectOnly: command.op === 'verify' });
      const restorationMs = performance.now() - restoration;
      const inspectStart = performance.now();
      let events = 0;
      for (let n = 1; n <= 4; n++) {
        await checkpoint();
        if (n > 1) await page.goto(`${origin}/target/${n}`, { waitUntil: 'load', timeout: 30_000 });
        const count = await page.locator('[data-event]').count();
        if (count !== 100) throw Error('partial-inspection');
        events += count;
      }
      await checkpoint();
      console.log(JSON.stringify({ id: command.id, tenant: expected.tenant, counter,
        revision: state.revision, events, restorationMs, inspectionMs: performance.now() - inspectStart }));
    } catch (error) {
      console.log(JSON.stringify({ id: command.id, error: error instanceof Error ? error.message : 'worker-failed' }));
    }
  }
} finally { await close(); }
