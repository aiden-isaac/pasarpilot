import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { Ownership } from './ownership.js';
import { Session } from './runtime.js';
import { writeJson } from './storage.js';
import { flushCapture } from './trading/capture.js';
import { appendObservation } from './events.js';
import { podman } from './container.js';

export async function inspectVisit(owner: Ownership, session: Session, check = async () => { owner.check(); }) {
  const path = join(owner.root, 'locks', `${owner.lease.tenant}.counter.json`);
  const seed = !existsSync(path);
  const counter = seed ? 0 : JSON.parse(readFileSync(path, 'utf8')).counter;
  if (!Number.isSafeInteger(counter) || counter < 0) throw Error('invalid-profile-counter');
  await check();
  if (seed) writeJson(path, { counter: 0, seedAttempted: true });
  const capture=existsSync(join(owner.root,'trading-capture.json'))&&JSON.parse(readFileSync(join(owner.root,'trading-capture.json'),'utf8')).enabled===true;
  const reply = await session.send({ op: 'visit', counter, seed, ...(capture?{captureTrading:true}:{}) });
  const flushStart = performance.now();
  await check();
  if(capture)flushCapture(owner,reply.tradingEvents);
  const observation = appendObservation(owner, Number(reply.counter), Number(reply.events));
  writeJson(path, { counter: reply.counter, seedAttempted: true });
  return { reply, observation, flushMs: performance.now() - flushStart };
}
export async function closeVisit(owner: Ownership, session: Session, state = 'stored') {
  const start = performance.now();
  if (!await session.stop()) throw Error('termination-unproven');
  await owner.release(true, state);
  podman(['rm', owner.lease.container], 5000);
  return performance.now() - start;
}
