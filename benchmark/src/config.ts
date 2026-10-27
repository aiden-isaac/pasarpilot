export const GiB = 1024 ** 3;
export const defaults = Object.freeze({
  slots: 1, leaseMs: 30_000, heartbeatMs: 5_000, shutdownMs: 15_000,
  visitTimeoutMs: 120_000, capBytes: 2 * GiB, futureReserve: 1.5 * GiB,
  cadenceMs: 60_000, visits: 100, targets: 4,
});
