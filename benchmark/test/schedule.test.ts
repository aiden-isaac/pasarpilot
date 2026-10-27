import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { dueTicks, interval, timestamp, tenant, actionId, validateJob, roundRobin, obsolete, retryDelay, schedulerRoot, type VisitJob } from '../src/schedule.js';

const job: VisitJob = { id: 'test', tenant: 'seller-a', kind: 'observation', revision: 1, dueAt: 0, deadline: 180_000, firstPending: 0 };
test('coalescing skips offline ticks without drifting the future cadence', () => {
  assert.deepEqual(dueTicks(1000, 1000, 999), { count: 0, latest: 1000, next: 1000 });
  assert.deepEqual(dueTicks(1000, 1000, 10_500), { count: 10, latest: 10_000, next: 11_000 });
  assert.deepEqual(dueTicks(1000, 1000, 1000), { count: 1, latest: 1000, next: 2000 });
});
test('round robin continues after each persisted tenant across a restart', () => {
  let cursor: string | null = null;
  const turns: string[] = [];
  for (let i = 0; i < 12; i++) { const chosen: string = roundRobin(cursor)[0]!; turns.push(chosen); cursor = chosen; }
  assert.deepEqual(turns, Array(4).fill(['seller-a','seller-b','seller-c']).flat());
  assert.deepEqual(roundRobin('seller-b'), ['seller-c','seller-a','seller-b']);
});
test('obsolete work and bounded transient retries have explicit reasons', () => {
  assert.equal(obsolete(job, 2, true, null, 0), 'obsolete-revision');
  assert.equal(obsolete(job, 1, false, null, 0), 'cancelled');
  assert.equal(obsolete(job, 1, true, 'history-unavailable', 0), 'history-unavailable');
  assert.equal(obsolete(job, 1, true, null, job.deadline), 'deadline-expired');
  assert.equal(retryDelay(job, 0, 'fixture-unavailable', 0), 30);
  assert.equal(retryDelay(job, 1, 'fixture-unavailable', 0), 60);
  assert.equal(retryDelay(job, 2, 'fixture-unavailable', 0), undefined);
  assert.equal(retryDelay(job, 0, 'reauth-required', 0), undefined);
  assert.equal(retryDelay({ ...job, kind: 'action' }, 0, 'fixture-unavailable', 0), undefined);
  assert.equal(retryDelay(job, 0, 'fixture-unavailable', 160_000), undefined);
});
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
