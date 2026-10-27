import assert from 'node:assert/strict';
import { test } from 'node:test';
import { capacity, simulate, model } from '../src/capacity.js';
test('known arithmetic includes failed occupancy and additional action/retry costs', () => {
  const demand = { durations: [45, 45], successful: 2 };
  const base = capacity(demand, 5, 15, 1);
  assert.equal(base.rawChecksPerHour, 80); assert.equal(base.budgetedChecksPerHour, 56);
  assert.equal(base.monthlyBrowserHoursPerSeller, 36);
  assert.equal(capacity({ durations: [45, 45], successful: 1 }, 5, 15, 1).service, 90);
  assert.equal(capacity(demand, 5, 15, 1, 1).rawChecksPerHour, 40);
  assert.throws(() => capacity({ durations: [], successful: 0 }, 5, 15, 1));
});
test('overload is unbounded; interactive access consumes real capacity and causes waiting', () => {
  const demand = { durations: [45], successful: 1 };
  assert.equal(simulate(demand, 100, 2, 1, 'burst').status, 'unbounded');
  const quiet = simulate(demand, 5, 15, 1, 'staggered');
  assert.equal(quiet.meanQueueSeconds, 0);
  assert.equal(quiet.meanDetectionSeconds, 495);
  assert.ok(Math.abs(quiet.p95DetectionSeconds! - 900) < 1e-6);
  assert.ok(simulate(demand, 5, 15, 1, 'staggered', 0, 0, 600).meanQueueSeconds! > 0);
  assert.ok(simulate(demand, 5, 15, 1, 'burst').p95QueueSeconds! > 0);
  assert.ok(simulate({ durations: [2], successful: 1 }, 5, 2, 1, 'staggered', 0, 0, 600).meanQueueSeconds! > 0);
});

test('concurrent projections use measured batch time instead of assuming linear scaling', () => {
  const rows = model({ durations: [45], successful: 1 }, [1, 2], { 2: [90, 90, 90] }).rows;
  const two = rows.find(r => r.slots === 2 && !r.outgoing && !r.extraRetry && !r.interactiveSeconds)!;
  assert.equal(two.rawChecksPerHour, 80);
  assert.match(two.timingEvidence, /measured concurrent/);
  assert.match(rows.find(r => r.slots === 4)!.timingEvidence, /extrapolation/);
});
