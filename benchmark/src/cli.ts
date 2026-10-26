import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { initialise, writeJson } from './storage.js';
import { baseline, minecraftPids } from './host.js';
import { budget, guardBytes } from './metrics.js';
import { defaults } from './config.js';
import { fixtureOrigin, inspect, podman } from './container.js';

process.umask(0o077);
const [command, dataRoot] = process.argv.slice(2);
if (command === 'baseline' && dataRoot) {
  const root = initialise(dataRoot);
  if (minecraftPids().length) throw Error('minecraft-still-running');
  const origin = fixtureOrigin();
  const samples = await baseline();
  if (minecraftPids().length) throw Error('minecraft-restarted');
  const manifest = { schemaVersion: 1, created: new Date().toISOString(), defaults,
    revision: process.env.BENCH_REVISION ?? 'unrecorded', node: process.version,
    runtime: podman(['--version']), image: inspect('localhost/pasarpilot-benchmark:v1').Id,
    fixtureOrigin: origin, hostSamples: samples, poolBudget: budget(samples),
    guard: guardBytes(samples[0]!.total), futureReserve: defaults.futureReserve,
    cpuLimit: 2, swapAllowed: false, sampleMs: 1000, minecraftStopped: true,
  };
  writeJson(join(root, 'manifest.json'), manifest);
  console.log(JSON.stringify({ baseline: 'complete', poolBudget: manifest.poolBudget, samples: samples.length }));
} else if (command === 'smoke' && dataRoot) {
  await (await import('./smoke.js')).smoke(initialise(dataRoot));
} else {
  console.log('Usage: node dist/src/cli.js baseline PRIVATE_DATA_ROOT');
  if (command) process.exitCode = 2;
}
