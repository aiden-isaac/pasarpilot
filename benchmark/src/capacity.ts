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
