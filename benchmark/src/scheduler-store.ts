import pg, { type PoolClient } from 'pg';
import PgBoss from 'pg-boss';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { rootLabel } from './container.js';
import { scheduledTenants, tenant, interval, timestamp, actionId, dueTicks, roundRobin, obsolete, queueOptions, retryDelay,
  schedulerRoot, validateJob, type VisitJob, type ScheduledTenant } from './schedule.js';
import type { Observation } from './events.js';

type Schedule = { tenant: ScheduledTenant; revision: number; enabled: boolean; blocked: string | null; interval_ms: number;
  next_due: Date; observation: string | null; latest_due: Date | null; first_pending: Date | null; coalesced: string };
export type Claim = PgBoss.JobWithMetadata<VisitJob>;
export type Outcome = { outcome: string; error?: string; observation?: Observation; attempt?: string; generation?: number;
  occupiedMs?: number; cleanupMs?: number; peak?: number; [key: string]: unknown };
export const transactionDb = (client: PoolClient) => ({ executeSql: (text: string, values: unknown[]) => client.query(text, values) });

export class SchedulerStore {
  readonly pool: pg.Pool;
  readonly boss: PgBoss;
  readonly schema: string;
  readonly queueSchema: string;
  private failure?: Error;
  private constructor(readonly root: string, socket: string) {
    const key = rootLabel(root).slice(0, 16);
    this.schema = `scheduler_${key}`; this.queueSchema = `queue_${key}`;
    this.pool = new pg.Pool({ host: socket, user: 'fixture', database: 'fixture', max: 3,
      connectionTimeoutMillis: 2000, query_timeout: 2500, statement_timeout: 2000, idle_in_transaction_session_timeout: 5000 });
    this.pool.on('error', error => { this.failure = error; });
    this.boss = new PgBoss({ schema: this.queueSchema, db: { executeSql: (text, values) => this.pool.query(text, values) },
      schedule: false, supervise: false, archiveCompletedAfterSeconds: 604800, archiveFailedAfterSeconds: 604800, deleteAfterSeconds: 1 });
    this.boss.on('error', error => { this.failure = error; });
  }
  static async open(root: string, setup = false, every = 60_000, socket = process.env.PGHOST ?? `${root}/socket`): Promise<SchedulerStore> {
    root = schedulerRoot(root); interval(every);
    if (!socket.startsWith('/')) throw Error('private-unix-database-socket-required');
    const store = new SchedulerStore(root, socket);
    try {
      if (setup) await store.setup(every);
      await store.identity();
      await store.boss.start();
      if (setup) for (const t of scheduledTenants) await store.boss.createQueue(t, { name: t, policy: 'short', ...queueOptions });
      return store;
    } catch (error) { await store.close(); throw error; }
  }
  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  }
  private async setup(every: number) {
    await this.transaction(async c => {
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [this.schema]);
      await c.query(`CREATE SCHEMA IF NOT EXISTS ${this.schema}`);
      await c.query(`CREATE TABLE IF NOT EXISTS ${this.schema}.identity (
        singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), version int NOT NULL, root text NOT NULL, host text NOT NULL,
        cursor text, rejected bigint NOT NULL DEFAULT 0)`);
      await c.query(`INSERT INTO ${this.schema}.identity(version,root,host) VALUES(1,$1,$2) ON CONFLICT DO NOTHING`, [this.root, hostname()]);
      await this.identity(c);
      await c.query(`CREATE TABLE IF NOT EXISTS ${this.schema}.schedule (
        tenant text PRIMARY KEY CHECK(tenant IN ('seller-a','seller-b','seller-c')), revision int NOT NULL DEFAULT 1,
        enabled boolean NOT NULL DEFAULT true, blocked text, interval_ms int NOT NULL CHECK(interval_ms BETWEEN 1000 AND 86400000),
        next_due timestamptz NOT NULL, observation uuid, latest_due timestamptz, first_pending timestamptz,
        coalesced bigint NOT NULL DEFAULT 0)`);
      await c.query(`CREATE TABLE IF NOT EXISTS ${this.schema}.action (
        tenant text REFERENCES ${this.schema}.schedule, id text NOT NULL, job uuid NOT NULL UNIQUE,
        outcome text NOT NULL DEFAULT 'queued', result jsonb, PRIMARY KEY(tenant,id))`);
      await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS one_action ON ${this.schema}.action(tenant) WHERE outcome IN ('queued','uncertain')`);
      await c.query(`CREATE TABLE IF NOT EXISTS ${this.schema}.attempt (
        job uuid NOT NULL, delivery int NOT NULL, tenant text NOT NULL, kind text NOT NULL, data jsonb NOT NULL,
        started_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz, owner jsonb, result jsonb,
        PRIMARY KEY(job,delivery))`);
      await c.query(`CREATE TABLE IF NOT EXISTS ${this.schema}.consumed (
        tenant text NOT NULL, source_id text NOT NULL, event jsonb NOT NULL, processed_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY(tenant,source_id))`);
      for (const t of scheduledTenants) await c.query(`INSERT INTO ${this.schema}.schedule(tenant,interval_ms,next_due)
        VALUES($1,$2,now()) ON CONFLICT DO NOTHING`, [t, every]);
    });
  }
  async identity(c: pg.Pool | PoolClient = this.pool) {
    const { rows } = await c.query(`SELECT * FROM ${this.schema}.identity`);
    if (rows.length !== 1 || rows[0].version !== 1 || rows[0].root !== this.root || rows[0].host !== hostname()) throw Error('incompatible-scheduler-dataset');
    return rows[0];
  }
  async healthy() {
    if (this.failure) throw this.failure;
    await this.pool.query('SELECT 1');
  }
  async close() { await this.boss.stop({ graceful: false }).catch(() => undefined); await this.pool.end(); }
  async tick(now = Date.now()) {
    timestamp(now);
    for (const t of scheduledTenants) await this.transaction(async c => {
      const s = (await c.query<Schedule>(`SELECT * FROM ${this.schema}.schedule WHERE tenant=$1 FOR UPDATE`, [t])).rows[0]!;
      if (!s.enabled || s.blocked) return;
      const ticks = dueTicks(s.next_due.getTime(), s.interval_ms, now);
      if (!ticks.count && !s.latest_due) return;
      const latest = Math.max(ticks.count ? ticks.latest : 0, s.latest_due?.getTime() ?? 0);
      let id = s.observation;
      const firstPending = s.first_pending?.getTime() ?? s.next_due.getTime();
      if (id) {
        const current = await this.boss.getJobById<VisitJob>(t, id, { db: transactionDb(c), includeArchive: true });
        if (!current) throw Error('missing-outstanding-observation');
        if (current.state === 'created' || current.state === 'retry') {
          // pg-boss 10 has no update API; pending payload refresh is scoped to the pinned schema.
          await c.query(`UPDATE ${this.queueSchema}.job SET data=data || $2::jsonb WHERE id=$1 AND state IN ('created','retry')`,
            [id, JSON.stringify({ dueAt: latest, deadline: latest + s.interval_ms })]);
          await c.query(`UPDATE ${this.schema}.schedule SET latest_due=NULL WHERE tenant=$1`, [t]);
        } else await c.query(`UPDATE ${this.schema}.schedule SET latest_due=$2, first_pending=COALESCE(first_pending,$3) WHERE tenant=$1`,
          [t, new Date(latest), new Date(firstPending)]);
      } else {
        id = randomUUID();
        const data: VisitJob = { id, tenant: t, kind: 'observation', revision: s.revision,
          dueAt: latest, deadline: latest + s.interval_ms, firstPending };
        if (!await this.boss.send(t, data, { id, singletonKey: 'observation', ...queueOptions, db: transactionDb(c) })) throw Error('observation-enqueue-conflict');
        await c.query(`UPDATE ${this.schema}.schedule SET observation=$2, latest_due=NULL, first_pending=$3 WHERE tenant=$1`, [t, id, new Date(firstPending)]);
      }
      await c.query(`UPDATE ${this.schema}.schedule SET next_due=$2, coalesced=coalesced+$3 WHERE tenant=$1`,
        [t, new Date(ticks.next), Math.max(0, ticks.count - (s.observation ? 0 : 1))]);
    });
  }
  async submitAction(t: string, id: string, expectedRevision: number, deadline: number, now = Date.now()) {
    tenant(t); actionId(id); timestamp(deadline); timestamp(now);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw Error('invalid-action-request');
    return this.transaction(async c => {
      const s = (await c.query<Schedule>(`SELECT * FROM ${this.schema}.schedule WHERE tenant=$1 FOR UPDATE`, [t])).rows[0]!;
      const duplicate = (await c.query(`SELECT * FROM ${this.schema}.action WHERE tenant=$1 AND id=$2`, [t, id])).rows[0];
      if (duplicate) return duplicate;
      if (deadline <= now) throw Error('invalid-action-request');
      const busy = (await c.query(`SELECT 1 FROM ${this.schema}.action WHERE tenant=$1 AND outcome IN ('queued','uncertain')`, [t])).rowCount;
      if (busy || !s.enabled || s.blocked) {
        await c.query(`UPDATE ${this.schema}.identity SET rejected=rejected+1`);
        return { rejected: busy ? 'action-backpressure' : s.blocked ?? 'disabled' };
      }
      const job = randomUUID();
      const data: VisitJob = { id: job, tenant: tenant(t), kind: 'action', actionId: id, expectedRevision, revision: s.revision, dueAt: now, deadline, firstPending: now };
      if (!await this.boss.send(t, data, { id: job, singletonKey: 'action', ...queueOptions, retryLimit: 0, db: transactionDb(c) })) throw Error('action-enqueue-conflict');
      return (await c.query(`INSERT INTO ${this.schema}.action(tenant,id,job) VALUES($1,$2,$3) RETURNING *`, [t, id, job])).rows[0];
    });
  }
  async status() {
    await this.identity();
    const schedules = (await this.pool.query(`SELECT * FROM ${this.schema}.schedule ORDER BY tenant`)).rows;
    const actions = (await this.pool.query(`SELECT * FROM ${this.schema}.action ORDER BY tenant,id`)).rows;
    const attempts = (await this.pool.query(`SELECT * FROM ${this.schema}.attempt ORDER BY started_at`)).rows;
    const queue = (await this.pool.query(`SELECT id,name,state,data,retry_count,start_after FROM ${this.queueSchema}.job WHERE state<'completed' ORDER BY created_on,id`)).rows;
    const consumed = (await this.pool.query(`SELECT count(*)::int count FROM ${this.schema}.consumed`)).rows[0].count;
    return { identity: await this.identity(), schedules, actions, attempts, queue, consumed };
  }
}
