import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ownership } from '../src/ownership.js';
import { actionGate, appendObservation, observations } from '../src/events.js';
test('observations survive producer release; uncertain and stale actions cannot be retried', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pasarpilot-events-'));
  try {
    const owner = await Ownership.acquire(root, 'seller-a');
    const event = appendObservation(owner, 0, 400);
    assert.equal(appendObservation(owner, 0, 400).eventId, event.eventId);
    assert.throws(() => actionGate(owner, 'effect-1', 0, 1), /stale-action/);
    actionGate(owner, 'effect-1', 1, 1);
    assert.throws(() => actionGate(owner, 'effect-1', 1, 1), /reconciliation/);
    await owner.release(true);
    assert.equal(observations(root).length, 1);
    assert.throws(() => appendObservation(owner, 1, 400), /ownership-lost/);
    appendFileSync(join(root, 'events', 'observations.jsonl'), '{"partial":');
    assert.throws(() => observations(root), /incomplete-observation-ledger/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
