export const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;
export function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)]!;
}
export type Demand = { durations: number[]; successful: number; actionSeconds?: number };
export function capacity(demand: Demand, sellers: number, intervalMinutes: number, slots: number,
  outgoing = 0, extraRetry = 0, interactiveSeconds = 0) {
  if (!demand.durations.length || !demand.durations.every(x => Number.isFinite(x) && x > 0) ||
      !Number.isInteger(demand.successful) || demand.successful < 1 || demand.successful > demand.durations.length ||
      ![1, 2, 4].includes(slots) || sellers < 1 || intervalMinutes <= 0 || outgoing < 0 || outgoing > 1 || extraRetry < 0 || extraRetry > 1 || interactiveSeconds < 0 || interactiveSeconds >= slots * 3600) throw Error('invalid-capacity-input');
  const service = demand.durations.reduce((a, b) => a + b, 0) / demand.successful;
  const action = demand.actionSeconds ?? service;
  if (!Number.isFinite(action) || action <= 0) throw Error('invalid-action-cost');
  const effectiveService = (service + outgoing * action) * (1 + extraRetry);
  const available = slots * 3600 - interactiveSeconds;
  const rawChecksPerHour = available / effectiveService;
  const budgetedChecksPerHour = rawChecksPerHour * 0.70;
  const requiredChecksPerHour = sellers * 60 / intervalMinutes;
  const utilisation = requiredChecksPerHour / rawChecksPerHour;
  return { sellers, intervalMinutes, slots, outgoing, extraRetry, interactiveSeconds, service, action,
    actionAssumed: demand.actionSeconds === undefined, effectiveService, rawChecksPerHour, budgetedChecksPerHour,
    utilisation, withinPlanningBudget: utilisation <= 0.70, stable: utilisation < 1,
    minimumBudgetedIntervalMinutes: 60 * sellers / budgetedChecksPerHour,
    monthlyBrowserHoursPerSeller: 720 * effectiveService / (intervalMinutes * 60) };
}
export function simulate(demand: Demand, sellers: number, intervalMinutes: number, slots: number,
  arrival: 'staggered' | 'burst', outgoing = 0, extraRetry = 0, interactiveSeconds = 0) {
  const plan = capacity(demand, sellers, intervalMinutes, slots, outgoing, extraRetry, interactiveSeconds);
  if (!plan.stable) return { meanQueueSeconds: null, p95QueueSeconds: null, meanDetectionSeconds: null, p95DetectionSeconds: null, status: 'unbounded' as const };
  let seed = 0x5eed;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const interval = intervalMinutes * 60, cycles = Math.max(30, Math.ceil(6 * 3600 / interval));
  const jobs: { due: number; cycle: number; interactive: boolean }[] = [];
  for (let cycle = 0; cycle < cycles; cycle++) for (let n = 0; n < sellers; n++) {
    jobs.push({ due: cycle * interval + (arrival === 'staggered' ? n * interval / sellers : 0), cycle, interactive: false });
  }
  if (interactiveSeconds) for (let t = 0; t < cycles * interval; t += 3600) jobs.push({ due: t, cycle: -1, interactive: true });
  jobs.sort((a, b) => a.due - b.due || Number(b.interactive) - Number(a.interactive));
  const available = Array<number>(slots).fill(0), waits: number[] = [], offsets: number[] = [];
  const correction = demand.durations.length / demand.successful;
  for (const job of jobs) {
    const slot = available.indexOf(Math.min(...available));
    const start = Math.max(job.due, available[slot]!);
    let service = interactiveSeconds, observationService = 0;
    if (!job.interactive) {
      service = demand.durations[Math.floor(random() * demand.durations.length)]! * correction;
      observationService = service;
      if (random() < outgoing) service += plan.action;
      if (random() < extraRetry) service += service;
    }
    available[slot] = start + service;
    if (!job.interactive && job.cycle >= 5) {
      const wait = start - job.due; waits.push(wait); offsets.push(wait + observationService);
    }
  }
  // Integrate the uniform interval residual exactly over simulated queue/service offsets.
  let low = Math.min(...offsets), high = Math.max(...offsets) + interval;
  for (let n = 0; n < 50; n++) {
    const middle = (low + high) / 2;
    const cdf = mean(offsets.map(offset => Math.max(0, Math.min(1, (middle - offset) / interval))));
    if (cdf < 0.95) low = middle; else high = middle;
  }
  return { meanQueueSeconds: mean(waits), p95QueueSeconds: percentile(waits, 0.95),
    meanDetectionSeconds: interval / 2 + mean(offsets), p95DetectionSeconds: high, status: 'projected' as const };
}
export function model(demand: Demand, measuredSlots: number[], concurrentDurations: Record<number, number[]> = {}) {
  const rows = [];
  for (const slots of [1, 2, 4]) for (const sellers of [5, 20, 50, 100]) for (const interval of [2, 5, 10, 15]) {
    for (const outgoing of [0, 0.25, 1]) for (const retry of [0, 0.05, 0.15]) for (const interactive of [0, 600]) {
      const durations = concurrentDurations[slots];
      const input = durations ? { durations, successful: durations.length } : demand;
      rows.push({ ...capacity(input, sellers, interval, slots, outgoing, retry, interactive),
        timingEvidence: durations ? 'three measured concurrent batch cycles, artificial hold excluded; short test, not sustained capacity' : slots === 1 ? '100 measured single-slot visits' : 'single-slot extrapolation',
        concurrencyMeasured: measuredSlots.includes(slots),
        staggered: simulate(input, sellers, interval, slots, 'staggered', outgoing, retry, interactive),
        burst: simulate(input, sellers, interval, slots, 'burst', outgoing, retry, interactive) });
    }
  }
  return { schemaVersion: 1, inputEvidence: 'measured occupied seconds per attempt; projections use an empirical distribution',
    assumptions: 'seed 0x5eed; at least six hours and 30 periodic cycles, first 5 cycles excluded; uniform event arrival within each interval; FCFS non-preemptive slots; outgoing work bundled after observation, retry repeats whole bundle; observed-failure cost amortised in duration distribution; one additional retry at the specified extra rate; interactive demand due hourly, FCFS without preemption; no tick coalescing; fixture-only, not an SLA', rows };
}
