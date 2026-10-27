import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { initialise, writeJson } from './storage.js';
import { baseline, minecraftPids } from './host.js';
import { budget, guardBytes } from './metrics.js';
import { defaults } from './config.js';
import { fixtureOrigin, inspect, podman } from './container.js';

process.umask(0o077);
const [command, dataRoot] = process.argv.slice(2);
if (command?.startsWith('scheduler-') && dataRoot) {
  await (await import('./scheduler-cli.js')).schedulerCommand(command, dataRoot, process.argv.slice(4));
} else if (command === 'baseline' && dataRoot) {
  const root = initialise(dataRoot);
  if (minecraftPids().length) throw Error('minecraft-still-running');
  const origin = fixtureOrigin();
  const cadenceMs = Number(process.argv[4] ?? defaults.cadenceMs);
  if (!Number.isFinite(cadenceMs) || cadenceMs < 0) throw Error('invalid-cadence');
  const samples = await baseline();
  if (minecraftPids().length) throw Error('minecraft-restarted');
  const manifest = { schemaVersion: 1, created: new Date().toISOString(), defaults, cadenceMs,
    revision: process.env.BENCH_REVISION ?? 'unrecorded', node: process.version,
    runtime: podman(['--version']), image: inspect('localhost/pasarpilot-benchmark:v1').Id,
    fixtureImage: inspect('pasarpilot-fixture').Image,
    fixtureOrigin: origin, hostSamples: samples, poolBudget: budget(samples),
    guard: guardBytes(samples[0]!.total), futureReserve: defaults.futureReserve,
    cpuLimit: 2, swapAllowed: false, sampleMs: 1000, minecraftStopped: true,
  };
  writeJson(join(root, 'manifest.json'), manifest);
  console.log(JSON.stringify({ baseline: 'complete', poolBudget: manifest.poolBudget, samples: samples.length }));
} else if (command === 'smoke' && dataRoot) {
  await (await import('./smoke.js')).smoke(initialise(dataRoot));
} else if (command === 'faults' && dataRoot) {
  await (await import('./faults.js')).faults(initialise(dataRoot));
} else if (['pilot', 'continuous', 'rotation'].includes(command ?? '') && dataRoot) {
  await (await import('./runner.js')).run(initialise(dataRoot), command as 'pilot' | 'continuous' | 'rotation',
    Number(process.argv[4] ?? (command === 'pilot' ? 3 : 100)), Number(process.argv[5] ?? defaults.cadenceMs));
} else if (command === 'capacity' && dataRoot) {
  const runs = join(dataRoot, 'runs');
  const names = readdirSync(runs);
  const name = names.filter(n => /^rotation-\d+\.json$/.test(n)).sort().at(-1);
  if (!name) throw Error('rotation-result-required');
  const run = JSON.parse(readFileSync(join(runs, name), 'utf8'));
  if (!run.complete) throw Error('complete-rotation-required');
  const measuredSlots = [1];
  const concurrentDurations: Record<number, number[]> = {};
  for (const slots of [2, 4]) {
    const name = names.filter(n => n.startsWith(`concurrency-${slots}-`) && n.endsWith('.json')).sort().at(-1);
    if (!name) continue;
    const concurrent = JSON.parse(readFileSync(join(runs, name), 'utf8'));
    if (concurrent.complete) {
      measuredSlots.push(slots);
      concurrentDurations[slots] = concurrent.cohorts.map((c: { occupiedCycleMs: number }) => c.occupiedCycleMs / 1000);
    }
  }
  const report = (await import('./capacity.js')).model({ durations: run.results.map((r: { occupiedMs: number }) => r.occupiedMs / 1000),
    successful: run.results.filter((r: { ok: boolean }) => r.ok).length }, measuredSlots, concurrentDurations);
  writeJson(join(runs, 'capacity.json'), { source: name, ...report, concurrencyNote: 'One-slot input is 100 visits; higher concurrency uses three batch-cycle timings if available, otherwise single-slot extrapolation. No sustained multislotted capacity test.' });
  console.log(JSON.stringify({ source: name, rows: report.rows.length, measuredSlots }));
} else if (command === 'interactive' && dataRoot) {
  await (await import('./interactive.js')).interactive(initialise(dataRoot));
} else if (command === 'concurrency' && dataRoot) {
  await (await import('./concurrency.js')).concurrency(initialise(dataRoot), Number(process.argv[4]));
} else if (command === 'settle' && dataRoot) {
  await (await import('./runner.js')).settle(initialise(dataRoot));
} else if (command === 'calibrate' && dataRoot) {
  const path = join(dataRoot, 'manifest.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  const name = readdirSync(join(dataRoot, 'runs')).filter(n => /^pilot-\d+\.json$/.test(n)).sort().at(-1);
  if (!name) throw Error('pilot-results-required');
  const pilot = JSON.parse(readFileSync(join(dataRoot, 'runs', name), 'utf8'));
  if (!pilot.complete || pilot.results.length < 3 || new Set(pilot.results.map((r: { tenant: string }) => r.tenant)).size < 3 || !pilot.nextAllowance) throw Error('pilot-incomplete');
  manifest.calibration = { source: name, peak: pilot.peak, minimumAllowance: pilot.nextAllowance,
    reason: 'Keep the conservative initial cap for matched primary arms; optional concurrency is recalibrated after both arms.' };
  manifest.measuredAllowance = Math.max(defaults.capBytes, pilot.nextAllowance);
  manifest.pilotPassed = true;
  if (manifest.measuredAllowance > manifest.poolBudget) throw Error('calibrated-budget-unavailable');
  writeJson(path, manifest); console.log(JSON.stringify(manifest.calibration));
} else {
  console.log('Usage: node dist/src/cli.js baseline PRIVATE_DATA_ROOT');
  if (command) process.exitCode = 2;
}
