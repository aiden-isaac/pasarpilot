import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialise } from './storage.js';

export const scheduledTenants = ['seller-a', 'seller-b', 'seller-c'] as const;
export type ScheduledTenant = typeof scheduledTenants[number];
export type VisitJob = { id: string; tenant: ScheduledTenant; kind: 'observation' | 'action'; revision: number;
  dueAt: number; deadline: number; firstPending: number; cancelled?: boolean; actionId?: string; expectedRevision?: number };
export const queueOptions = { expireInSeconds: 180, retryLimit: 2, retryDelay: 30, retryBackoff: false, retentionDays: 3650 };
export function schedulerRoot(root: string): string {
  const repository = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
  const offset = relative(repository, resolve(root));
  if (!isAbsolute(root) || (!offset.startsWith('..' + '/') && offset !== '..' && !isAbsolute(offset))) throw Error('private-root-must-be-outside-repository');
  return initialise(root);
}
export function tenant(value: string): ScheduledTenant {
  if (!scheduledTenants.includes(value as ScheduledTenant)) throw Error('unknown-scheduler-tenant');
  return value as ScheduledTenant;
}
export function interval(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1000 || value > 86_400_000) throw Error('invalid-interval');
  return value;
}
export function timestamp(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 8.64e15) throw Error('invalid-timestamp');
  return value;
}
export function actionId(value: string): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(value)) throw Error('invalid-action-id');
  return value;
}
export function validateJob(job: VisitJob): void {
  tenant(job.tenant); timestamp(job.dueAt); timestamp(job.deadline); timestamp(job.firstPending);
  if (!/^[a-f0-9-]{36}$/.test(job.id) || !Number.isSafeInteger(job.revision) || job.revision < 1 ||
      !['observation','action'].includes(job.kind) || job.deadline <= job.dueAt || job.firstPending > job.dueAt ||
      (job.cancelled !== undefined && typeof job.cancelled !== 'boolean')) throw Error('invalid-persisted-job');
  if (job.kind === 'action') {
    actionId(job.actionId!);
    if (!Number.isSafeInteger(job.expectedRevision) || job.expectedRevision! < 0) throw Error('invalid-persisted-action');
  }
}
export function dueTicks(next: number, every: number, now: number) {
  timestamp(next); timestamp(now); interval(every);
  const count = now < next ? 0 : Math.floor((now - next) / every) + 1;
  return { count, latest: count ? next + (count - 1) * every : next, next: next + count * every };
}
export function roundRobin(cursor: string | null): ScheduledTenant[] {
  const start = cursor ? (scheduledTenants.indexOf(tenant(cursor)) + 1) % scheduledTenants.length : 0;
  return [...scheduledTenants.slice(start), ...scheduledTenants.slice(0, start)];
}
export function obsolete(job: VisitJob, revision: number, enabled: boolean, blocked: string | null, now = Date.now()): string | undefined {
  if (job.cancelled || !enabled) return 'cancelled';
  if (job.revision !== revision) return 'obsolete-revision';
  if (blocked) return blocked;
  if (job.deadline <= now) return 'deadline-expired';
}
export function retryDelay(job: VisitJob, retryCount: number, error: string, now = Date.now()): number | undefined {
  if (job.kind !== 'observation' || retryCount >= 2 ||
      !/^(fixture-unavailable|startup-timeout|visit-timeout)$/.test(error)) return;
  const delay = retryCount === 0 ? 30 : 60;
  if (job.deadline > now + delay * 1000) return delay;
}
