import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Ownership, assertLease } from '../src/ownership.js';

test('a profile lock outlives lease expiry and release requires proven termination', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pasarpilot-owner-'));
  try {
    const a = await Ownership.acquire(root, 'seller-a');
    await assert.rejects(Ownership.acquire(root, 'seller-a'), /profile-locked/);
    assert.throws(() => assertLease(a.lease, a.lease, a.lease.expires + 1), /ownership-lost/);
    assert.throws(() => assertLease(a.lease, { ...a.lease, generation: 999 }), /ownership-lost/);
    await assert.rejects(a.release(false), /termination-unproven/);
    await a.release(true);
    const b = await Ownership.acquire(root, 'seller-a');
    assert.equal(b.lease.generation, a.lease.generation + 1);
    await b.release(true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
