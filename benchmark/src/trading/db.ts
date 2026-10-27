import pg, { type PoolClient } from 'pg';
import PgBoss from 'pg-boss';
export type Client = PoolClient;
export const schemaVersion = 1;
export function pool(user = 'trading_runtime') {
  if (!process.env.PGHOST?.startsWith('/')) throw Error('explicit-private-PGHOST-required');
  return new pg.Pool({ host: process.env.PGHOST, database: 'fixture', user, max: 3,
    connectionTimeoutMillis: 2000, statement_timeout: 5000, idle_in_transaction_session_timeout: 10000 });
}
export async function tx<T>(p: pg.Pool, work: (c: Client) => Promise<T>): Promise<T> {
  const c = await p.connect();
  try { await c.query('BEGIN'); const result = await work(c); await c.query('COMMIT'); return result; }
  catch (error) { await c.query('ROLLBACK'); throw error; } finally { c.release(); }
}
export function queue(p: pg.Pool) {
  const b = new PgBoss({ schema: 'trading_queue', db: { executeSql: (s, v) => p.query(s, v) },
    schedule: false, supervise: false });
  b.on('error', () => { console.error('trading-queue-error'); });
  return b;
}
export async function checkSchema(p: pg.Pool) {
  const r = await p.query('SELECT version FROM trading.migrations ORDER BY version');
  if (r.rows.length !== 1 || r.rows[0].version !== schemaVersion) throw Error('incompatible-trading-schema');
}
export async function activity(c: Client, seller: string, action: string, record: string, version: number, actor = 'seller', reason = '', source: string | null = null) {
  await c.query('INSERT INTO trading.activity(seller_id,action,record_id,version,actor,reason,source_id) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [seller, action, record, version, actor, reason, source]);
}
export async function wake(c:Client,name:string,data:object,startAfter?:Date) {
 const b=queue({query:c.query.bind(c)} as unknown as pg.Pool);
 if(!await b.send(name,data,{db:{executeSql:(q,v)=>c.query(q,v)},startAfter,retryLimit:5,retryDelay:5})) throw Error('wakeup-failed');
}
