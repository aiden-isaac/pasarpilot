import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sampleHost } from '../src/host.js';
import { admit, allowance, PressureGuard, budget, sampleAttempt, diskUsage } from '../src/metrics.js';
import { GiB } from '../src/config.js';
test('admission preserves reserves, the slot ceiling and aggregate allowance', () => {
  const s = { ...sampleHost(), total: 8 * GiB, available: 7 * GiB, psiFull: 0, psiSome: 0 };
  admit(s, 2 * GiB, 0, 1, 0, 3 * GiB);
  assert.throws(() => admit(s, 2 * GiB, 1, 1, 2 * GiB, 3 * GiB));
  assert.throws(() => admit({ ...s, available: 3 * GiB }, 2 * GiB, 0, 1, 0, 3 * GiB));
  assert.throws(() => admit(s, 2 * GiB, 0, 1, 2 * GiB, 3 * GiB));
  assert.throws(() => budget([s]));
  assert.equal(allowance(100 * 1024 ** 2), 128 * 1024 ** 2);
});
test('cgroup accounting keeps physical metrics separate and discloses unavailable counters', () => {
  const root = mkdtempSync(join(tmpdir(), 'pasarpilot-metrics-'));
  try {
    writeFileSync(join(root, 'cgroup.procs'), String(process.pid));
    writeFileSync(join(root, 'memory.current'), '1048576');
    writeFileSync(join(root, 'memory.peak'), '2097152');
    writeFileSync(join(root, 'memory.events'), 'oom 0\noom_kill 0');
    const sample = sampleAttempt(root);
    assert.equal(sample.memory, 1048576); assert.equal(sample.peak, 2097152);
    assert.equal(sample.processes, 1); assert.ok(sample.pssSum > 0);
    assert.equal(sample.swapMax, null);
    assert.ok(diskUsage(root).allocatedBytes > 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('sustained pressure stops, but an isolated low sample does not', () => {
  const g = new PressureGuard();
  const s = { ...sampleHost(), time: 0, total: 8 * GiB, available: 0, psiFull: 0 };
  g.check(s); g.check({ ...s, time: 1000 });
  assert.throws(() => g.check({ ...s, time: 2000 }), /host-pressure-stop/);
  const p = new PressureGuard();
  p.check({ ...s, available: 7 * GiB, psiFull: 2 });
  assert.throws(() => p.check({ ...s, available: 7 * GiB, psiFull: 2, time: 10_000 }), /host-pressure-stop/);
});
