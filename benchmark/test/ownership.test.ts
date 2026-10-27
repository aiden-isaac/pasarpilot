import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Ownership, assertLease, assertAutomation, holdLock } from '../src/ownership.js';
import { writeJson } from '../src/storage.js';

test('a profile lock outlives lease expiry and release requires proven termination', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pasarpilot-owner-'));
  try {
    const a = await Ownership.acquire(root, 'seller-a');
    await assert.rejects(Ownership.acquire(root, 'seller-a'), /profile-locked/);
    assert.throws(() => assertLease(a.lease, a.lease, a.lease.expires + 1), /ownership-lost/);
    assert.throws(() => assertLease(a.lease, { ...a.lease, generation: 999 }), /ownership-lost/);
    assert.throws(() => assertLease({ ...a.lease, deadline: 10 }, a.lease, 10), /deadline-expired/);
    await assert.rejects(a.release(false), /termination-unproven/);
    assertAutomation(a.lease);
    assert.throws(() => assertAutomation({ ...a.lease, state: 'interactive' }), /interactive-control-exclusive/);
    await a.release(true);
    const b = await Ownership.acquire(root, 'seller-a');
    assert.equal(b.lease.generation, a.lease.generation + 1);
    await b.release(true);
    writeJson(b.statePath, { ...b.lease, state: 'monitoring', expires: Date.now() + 30_000 });
    await assert.rejects(Ownership.acquire(root, 'seller-a'), /reconciliation/);
    writeJson(b.statePath, { ...b.lease, state: 'stored' });
    const c = await Ownership.acquire(root, 'seller-a');
    await c.release(true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a competing supervisor cannot enter the dataset before the first releases its lock', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pasarpilot-supervisor-'));
  try {
    const path = join(root, 'supervisor.lock');
    const first = await holdLock(path);
    await assert.rejects(holdLock(path), /profile-locked/);
    await new Promise<void>(resolve => { first.once('exit', () => resolve()); first.stdin.end(); });
    const second = await holdLock(path);
    await new Promise<void>(resolve => { second.once('exit', () => resolve()); second.stdin.end(); });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
