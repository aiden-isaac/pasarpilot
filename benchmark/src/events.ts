import { closeSync, existsSync, fsyncSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Ownership } from './ownership.js';
import { writeJson } from './storage.js';

export type Observation = { schemaVersion: 1; eventId: string; sourceId: string; tenant: string;
  sourceRevision: number; attemptId: string; generation: number; observedAt: string; eventCount: number };
export function observations(root: string): Observation[] {
  const path = join(root, 'events', 'observations.jsonl');
  return existsSync(path) ? readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
}
export function appendObservation(owner: Ownership, counter: number, eventCount: number): Observation {
  owner.check();
  if (!Number.isInteger(counter) || counter < 0 || eventCount !== 400) throw Error('incomplete-observation');
  const sourceId = `${owner.lease.tenant}:${counter}`;
  const existing = observations(owner.root).find(e => e.sourceId === sourceId);
  if (existing) return existing;
  const event: Observation = { schemaVersion: 1, eventId: randomUUID(), sourceId,
    tenant: owner.lease.tenant, sourceRevision: counter, attemptId: owner.lease.attempt,
    generation: owner.lease.generation, observedAt: new Date().toISOString(), eventCount };
  const fd = openSync(join(owner.root, 'events', 'observations.jsonl'), 'a', 0o600);
  try { owner.check(); writeFileSync(fd, JSON.stringify(event) + '\n'); fsyncSync(fd); }
  finally { closeSync(fd); }
  return event;
}
export function actionGate(owner: Ownership, id: string, expectedRevision: number, currentRevision: number) {
  owner.check();
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(id)) throw Error('invalid-action-id');
  if (expectedRevision !== currentRevision) throw Error('stale-action');
  const path = join(owner.root, 'events', `${id}.json`);
  if (existsSync(path)) throw Error('action-needs-reconciliation');
  // Persist uncertainty before external work: a crash must never turn into a blind retry.
  writeJson(path, { id, state: 'uncertain', tenant: owner.lease.tenant, revision: currentRevision });
  return () => writeJson(path, { id, state: 'applied', tenant: owner.lease.tenant, revision: currentRevision });
}
