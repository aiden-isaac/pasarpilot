import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sampleHost, type HostSample } from './host.js';
import { GiB, defaults } from './config.js';

function scalar(path: string): number | null {
  try { const value = Number(readFileSync(path, 'utf8').trim()); return Number.isFinite(value) ? value : null; }
  catch { return null; }
}
function pairs(path: string): Record<string, number> | null {
  try { return Object.fromEntries(readFileSync(path, 'utf8').trim().split('\n').map(l => { const [k, n] = l.split(' '); return [k!, Number(n)]; })); }
  catch { return null; }
}
export function sampleAttempt(cg: string) {
  let rssSum = 0, pssSum = 0, processSwapSum = 0, inaccessibleProcesses = 0;
  const pids = readFileSync(join(cg, 'cgroup.procs'), 'utf8').trim().split(/\s+/).filter(Boolean).map(Number);
  for (const pid of pids) {
    try {
      const text = readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8');
      rssSum += Number(text.match(/^Rss:\s+(\d+)/m)?.[1] ?? 0) * 1024;
      pssSum += Number(text.match(/^Pss:\s+(\d+)/m)?.[1] ?? 0) * 1024;
      processSwapSum += Number(text.match(/^Swap:\s+(\d+)/m)?.[1] ?? 0) * 1024;
    } catch { inaccessibleProcesses++; }
  }
  return { time: Date.now(), memory: scalar(join(cg, 'memory.current')), peak: scalar(join(cg, 'memory.peak')),
    memoryMax: scalar(join(cg, 'memory.max')), swap: scalar(join(cg, 'memory.swap.current')),
    swapMax: scalar(join(cg, 'memory.swap.max')), stat: pairs(join(cg, 'memory.stat')),
    cpu: pairs(join(cg, 'cpu.stat')), events: pairs(join(cg, 'memory.events')),
    processes: pids.length, rssSum, pssSum, processSwapSum, inaccessibleProcesses };
}
export function guardBytes(total: number): number { return Math.max(GiB, total * 0.15); }
export function budget(samples: HostSample[]): number {
  if (samples.length < 61 || samples.at(-1)!.time - samples[0]!.time < 59_000) throw Error('baseline-too-short');
  return Math.max(0, Math.min(...samples.map(s => s.available)) - guardBytes(samples[0]!.total) - defaults.futureReserve);
}
export function admit(sample: HostSample, cap: number, active: number, slots: number, allocated: number, poolBudget: number): void {
  if (!Number.isFinite(cap) || cap <= 0 || active >= slots || allocated + cap > poolBudget ||
      sample.available - guardBytes(sample.total) - defaults.futureReserve < cap) throw Error('resource-admission-denied');
  if (sample.psiFull === null || sample.psiSome === null || !Number.isFinite(sample.psiFull) || sample.psiFull >= 1) throw Error('pressure-accounting-or-headroom-unavailable');
}
export class PressureGuard {
  private low = 0;
  private psiSince?: number;
  private samples: HostSample[] = [];
  check(sample = sampleHost()): void {
    this.low = sample.available < guardBytes(sample.total) ? this.low + 1 : 0;
    if (sample.psiFull === null || !Number.isFinite(sample.psiFull)) throw Error('missing-psi-accounting');
    if (sample.psiFull >= 1) this.psiSince ??= sample.time; else this.psiSince = undefined;
    this.samples.push(sample);
    while (this.samples.length > 1 && this.samples[1]!.time < sample.time - 10_000) this.samples.shift();
    const first = this.samples[0]!;
    const elapsed = (sample.time - first.time) / 1000;
    const swapRate = elapsed >= 10 ? (sample.swapOutPages - first.swapOutPages) * 4096 / elapsed : 0;
    if (this.low >= 3 || (this.psiSince !== undefined && sample.time - this.psiSince >= 10_000) || swapRate > 1024 ** 2) throw Error('host-pressure-stop');
  }
}
export function allowance(peak: number): number {
  if (!Number.isFinite(peak) || peak <= 0) throw Error('invalid-measured-peak');
  return Math.ceil(peak * 1.25 / (64 * 1024 ** 2)) * 64 * 1024 ** 2;
}
