import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sampleHost } from '../src/host.js';
import { admit, allowance, PressureGuard, budget } from '../src/metrics.js';
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
test('sustained pressure stops, but an isolated low sample does not', () => {
  const g = new PressureGuard();
  const s = { ...sampleHost(), time: 0, total: 8 * GiB, available: 0, psiFull: 0 };
  g.check(s); g.check({ ...s, time: 1000 });
  assert.throws(() => g.check({ ...s, time: 2000 }), /host-pressure-stop/);
  const p = new PressureGuard();
  p.check({ ...s, available: 7 * GiB, psiFull: 2 });
  assert.throws(() => p.check({ ...s, available: 7 * GiB, psiFull: 2, time: 10_000 }), /host-pressure-stop/);
});
