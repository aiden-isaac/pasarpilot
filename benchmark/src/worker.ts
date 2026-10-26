import { chromium, type BrowserContext } from 'playwright';
import { createInterface } from 'node:readline';
import { mkdirSync, readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { assertLease, type Lease } from './ownership.js';
import { verifySandbox } from './sandbox.js';

const leaseFile = '/attempt/lease.json';
const expected: Lease = JSON.parse(readFileSync(leaseFile, 'utf8'));
const check = () => assertLease(JSON.parse(readFileSync(leaseFile, 'utf8')), expected);
const origin = process.env.FIXTURE_ORIGIN!;
if (!origin || process.getuid?.() === 0) throw Error('unsafe-worker');
mkdirSync('/tmp/home', { recursive: true, mode: 0o700 });
let context: BrowserContext | undefined;
const launch = performance.now();
async function close() { await context?.close(); context = undefined; }
process.on('SIGTERM', () => { void close().finally(() => process.exit()); });
try {
  check();
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
  const input = createInterface({ input: process.stdin });
  for await (const line of input) {
    const command = JSON.parse(line);
    try {
      if (command.op === 'close') { await close(); console.log(JSON.stringify({ id: command.id, closed: true })); break; }
      check();
      if (command.op === 'control') {
        const response = await context.request.post(origin + command.path, { data: command.data });
        console.log(JSON.stringify({ id: command.id, status: response.status(), result: await response.json() })); continue;
      }
      if (command.op !== 'visit') throw Error('unknown-operation');
      const restoration = performance.now();
      if (command.seed) {
        const response = await context.request.post(`${origin}/seed/${expected.tenant}`);
        if (response.status() !== 200) throw Error('seed-failed');
      }
      check();
      const response = await context.request.get(`${origin}/api/state`);
      if (response.status() === 401) throw Error('reauth-required');
      if (response.status() !== 200) throw Error('fixture-unavailable');
      const state = await response.json();
      if (state.tenant !== expected.tenant) throw Error('isolation-failure');
      if (!state.historyReady) throw Error('history-unavailable');
      await page.goto(`${origin}/target/1`, { waitUntil: 'load', timeout: 30_000 });
      await page.waitForFunction(() => 'fixtureStorage' in window);
      const counter = await page.evaluate(async ({ tenant, counter, seed }) => {
        const fn = (window as unknown as { fixtureStorage: (t: string, n: number, s: boolean) => Promise<number> }).fixtureStorage;
        return fn(tenant, counter, seed);
      }, { tenant: expected.tenant, counter: command.counter, seed: !!command.seed });
      const restorationMs = performance.now() - restoration;
      const inspectStart = performance.now();
      let events = 0;
      for (let n = 1; n <= 4; n++) {
        check();
        if (n > 1) await page.goto(`${origin}/target/${n}`, { waitUntil: 'load', timeout: 30_000 });
        const count = await page.locator('[data-event]').count();
        if (count !== 100) throw Error('partial-inspection');
        events += count;
      }
      check();
      console.log(JSON.stringify({ id: command.id, tenant: expected.tenant, counter,
        revision: state.revision, events, restorationMs, inspectionMs: performance.now() - inspectStart }));
    } catch (error) {
      console.log(JSON.stringify({ id: command.id, error: error instanceof Error ? error.message : 'worker-failed' }));
    }
  }
} finally { await close(); }
