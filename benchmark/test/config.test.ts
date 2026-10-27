import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaults, GiB } from '../src/config.js';
test('initial experiment is bounded to one slot with declared ownership deadlines', () => {
  assert.equal(defaults.slots, 1);
  assert.equal(defaults.capBytes, 2 * GiB);
  assert.ok(defaults.heartbeatMs < defaults.leaseMs);
});
