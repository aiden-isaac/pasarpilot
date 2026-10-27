import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { dueTicks, interval, timestamp, tenant, actionId, validateJob, roundRobin, obsolete, retryDelay, schedulerRoot, type VisitJob } from '../src/schedule.js';

const job: VisitJob = { id: 'test', tenant: 'seller-a', kind: 'observation', revision: 1, dueAt: 0, deadline: 180_000, firstPending: 0 };
test('scheduler rejects unknown tenants, unsafe roots and invalid scalar inputs', () => {
  for (const value of ['seller-d','../seller-a','']) assert.throws(() => tenant(value));
  for (const value of [0,NaN,Infinity,999,86_400_001]) assert.throws(() => interval(value));
  for (const value of [-1,NaN,Infinity,8.64e15 + 1]) assert.throws(() => timestamp(value));
  for (const value of ['', '../test', 'a'.repeat(65)]) assert.throws(() => actionId(value));
  assert.throws(() => schedulerRoot(resolve('..')), /outside-repository/);
  assert.throws(() => schedulerRoot('relative'), /outside-repository/);
  assert.throws(() => validateJob({ ...job, id: '00000000-0000-0000-0000-000000000000', deadline: NaN }), /timestamp/);
  assert.throws(() => validateJob({ ...job, id: '00000000-0000-0000-0000-000000000000', revision: -1 }), /persisted-job/);
});
