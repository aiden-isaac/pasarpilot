import { readFileSync, readdirSync, readlinkSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
export type HostSample = ReturnType<typeof sampleHost>;
export function sampleHost() {
  const values = (file: string) => Object.fromEntries(readFileSync(file, 'utf8').trim().split('\n').map(s => {
    const [key, value] = s.replace(':', '').trim().split(/\s+/); return [key!, Number(value)];
  }));
  const mem = values('/proc/meminfo'), vm = values('/proc/vmstat');
  const cpu = readFileSync('/proc/stat', 'utf8').split('\n')[0]!.trim().split(/\s+/).slice(1).map(Number);
  let psiFull: number | null = null, psiSome: number | null = null;
  try {
    const psi = readFileSync('/proc/pressure/memory', 'utf8');
    psiFull = Number(psi.match(/full avg10=([\d.]+)/)?.[1]);
    psiSome = Number(psi.match(/some avg10=([\d.]+)/)?.[1]);
  } catch { /* Unsupported accounting is reported, never silently treated as zero pressure. */ }
  return { time: Date.now(), total: mem.MemTotal! * 1024, available: mem.MemAvailable! * 1024,
    anon: mem.AnonPages! * 1024, cache: mem.Cached! * 1024,
    swapUsed: (mem.SwapTotal! - mem.SwapFree!) * 1024,
    swapInPages: vm.pswpin!, swapOutPages: vm.pswpout!, cpu, psiFull, psiSome };
}
export function minecraftPids(): number[] {
  return readdirSync('/proc').filter(p => /^\d+$/.test(p)).flatMap(p => {
    try { return readFileSync(`/proc/${p}/comm`, 'utf8').trim() === 'java' && readlinkSync(`/proc/${p}/cwd`).includes('/minecraft/') ? [Number(p)] : []; }
    catch { return []; }
  });
}
export async function baseline(seconds = 60): Promise<HostSample[]> {
  const samples: HostSample[] = [];
  for (let i = 0; i <= seconds; i++) { samples.push(sampleHost()); if (i < seconds) await delay(1000); }
  return samples;
}
