import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { envelope,type Envelope } from './trading/envelope.js';
import { fileURLToPath } from 'node:url';

export const tenants = ['seller-a', 'seller-b', 'seller-c', 'seller-d'] as const;
export function validTenant(value: string): boolean { return tenants.includes(value as typeof tenants[number]); }
type State = { tenant: string; revision: number; locked: boolean; actions: Map<string, number> };

export function fixture(trading:Record<string,Envelope[]>={}): Server {
  for(const [tenant,events] of Object.entries(trading)) {if(!validTenant(tenant)||events.length>50)throw Error('invalid-fixture-trading-config');events.forEach(envelope);}
  const sessions = new Map<string, State>();
  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'self'; frame-ancestors 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const path = new URL(req.url ?? '/', 'http://fixture').pathname;
    const send = (status: number, value: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value));
    };
    let body = '';
    try {
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 4096) { send(413, { error: 'body-too-large' }); return; }
      }
      const seed = path.match(/^\/seed\/([^/]+)$/);
      if (seed && req.method === 'POST') {
        const tenant = seed[1]!;
        if (!validTenant(tenant)) { send(400, { error: 'unknown-tenant' }); return; }
        const token = randomUUID();
        sessions.set(token, { tenant, revision: 0, locked: false, actions: new Map() });
        res.setHeader('Set-Cookie', `fixture_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`);
        send(200, { tenant }); return;
      }
      const token = req.headers.cookie?.match(/(?:^|;\s*)fixture_session=([^;]+)/)?.[1];
      const state = token ? sessions.get(token) : undefined;
      if (path === '/health' && req.method === 'GET') { send(200, { ready: true }); return; }
      if (!state) { send(401, { error: 'authentication-required' }); return; }
      if (path === '/api/state' && req.method === 'GET') {
        send(200, { tenant: state.tenant, revision: state.revision, historyReady: !state.locked }); return;
      }
      if (path === '/api/history' && req.method === 'POST') {
        const input = JSON.parse(body);
        if (typeof input.locked !== 'boolean') { send(400, { error: 'invalid-history-state' }); return; }
        state.locked = input.locked; send(200, { historyReady: !state.locked }); return;
      }
      if (path === '/api/expire' && req.method === 'POST') {
        sessions.delete(token!); send(200, { expired: true }); return;
      }
      if (state.locked) { send(423, { error: 'history-unavailable' }); return; }
      const actionStatus = path.match(/^\/api\/actions\/([a-zA-Z0-9-]{1,64})$/);
      if (actionStatus && req.method === 'GET') {
        const revision = state.actions.get(actionStatus[1]!);
        send(200, { id: actionStatus[1], applied: revision !== undefined, revision: revision ?? null }); return;
      }
      if (path === '/api/action' && req.method === 'POST') {
        const input = JSON.parse(body);
        if (typeof input.id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(input.id) || !Number.isInteger(input.revision)) {
          send(400, { error: 'invalid-action' }); return;
        }
        if (state.actions.has(input.id)) { send(409, { error: 'already-applied' }); return; }
        if (input.revision !== state.revision) { send(409, { error: 'stale-revision' }); return; }
        state.actions.set(input.id, ++state.revision);
        send(200, { revision: state.revision }); return;
      }
      if(path==='/api/wts'&&req.method==='GET'){send(200,{tenant:state.tenant,events:trading[state.tenant]??[]});return;}
      if (/^\/target\/[1-4]$/.test(path) && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<!doctype html><title>Synthetic trading fixture</title><main><h1>Controlled listing</h1><ol>' +
          Array.from({ length: 100 }, (_, i) => `<li data-event="${i}">Synthetic item ${i}: MYR 10</li>`).join('') +
          '</ol></main><script src="/fixture.js"></script>'); return;
      }
      if (path === '/fixture.js' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        res.end(`window.fixtureStorage = async (tenant, expected, seed, inspectOnly = false) => {
          const db = await new Promise((resolve, reject) => {
            const r = indexedDB.open('synthetic-state', 1);
            r.onupgradeneeded = () => r.result.createObjectStore('state');
            r.onerror = () => reject(Error('indexeddb-open'));
            r.onsuccess = () => resolve(r.result);
          });
          const read = async key => new Promise((resolve, reject) => {
            const tx = db.transaction('state'); const r = tx.objectStore('state').get(key);
            r.onsuccess = () => resolve(r.result); r.onerror = () => reject(Error('indexeddb-read'));
          });
          const marker = await read('tenant'); const count = await read('counter');
          if (seed ? (marker !== undefined || localStorage.getItem('tenant') !== null) :
            (marker !== tenant || localStorage.getItem('tenant') !== tenant || count !== expected ||
             localStorage.getItem('counter') !== String(expected))) throw Error('persistence-or-isolation');
          if (inspectOnly && !seed) { db.close(); return expected; }
          const next = seed ? 0 : expected + 1;
          await new Promise((resolve, reject) => {
            const tx = db.transaction('state', 'readwrite', { durability: 'strict' });
            tx.objectStore('state').put(tenant, 'tenant'); tx.objectStore('state').put(next, 'counter');
            tx.oncomplete = resolve; tx.onerror = () => reject(Error('indexeddb-write'));
          });
          db.close(); localStorage.setItem('tenant', tenant); localStorage.setItem('counter', String(next));
          return next;
        };`); return;
      }
      send(404, { error: 'not-found' });
    } catch { if (!res.headersSent) send(400, { error: 'invalid-request' }); else res.end(); }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = fixture(process.env.WTS_FIXTURE_FILE?JSON.parse(readFileSync(process.env.WTS_FIXTURE_FILE,'utf8')):{}).listen(8080, '0.0.0.0');
  process.on('SIGTERM', () => server.close());
}
