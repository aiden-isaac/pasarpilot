import assert from 'node:assert/strict';
import { test } from 'node:test';
import { capacity } from '../src/capacity.js';
test('known arithmetic includes failed occupancy and additional action/retry costs', () => {
  const demand = { durations: [45, 45], successful: 2 };
  const base = capacity(demand, 5, 15, 1);
  assert.equal(base.rawChecksPerHour, 80); assert.equal(base.budgetedChecksPerHour, 56);
  assert.equal(base.monthlyBrowserHoursPerSeller, 36);
  assert.equal(capacity({ durations: [45, 45], successful: 1 }, 5, 15, 1).service, 90);
  assert.equal(capacity(demand, 5, 15, 1, 1).rawChecksPerHour, 40);
  assert.throws(() => capacity({ durations: [], successful: 0 }, 5, 15, 1));
});
