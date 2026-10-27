import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture } from '../src/fixture.js';

test('fixture separates identities, history readiness, stale actions and authentication', async () => {
  const server = fixture(); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const seed = async (tenant: string) => {
      const r = await fetch(`${base}/seed/${tenant}`, { method: 'POST' });
      assert.equal(r.status, 200); return r.headers.get('set-cookie')!.split(';')[0]!;
    };
    const a = await seed('seller-a'), b = await seed('seller-b');
    const request = (path: string, cookie = a, body?: unknown) => fetch(base + path, {
      headers: { cookie }, method: body === undefined ? 'GET' : 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.equal((await (await request('/api/state')).json()).tenant, 'seller-a');
    assert.equal((await (await request('/api/state', b)).json()).tenant, 'seller-b');
    assert.equal((await fetch(`${base}/seed/unknown`, { method: 'POST' })).status, 400);
    assert.equal((await request('/api/action', a, { id: 'effect-1', revision: 2 })).status, 409);
    assert.equal((await request('/api/action', a, { id: 'effect-1', revision: 0 })).status, 200);
    assert.deepEqual(await (await request('/api/actions/effect-1')).json(), { id: 'effect-1', applied: true, revision: 1 });
    assert.deepEqual(await (await request('/api/actions/effect-1', b)).json(), { id: 'effect-1', applied: false, revision: null });
    assert.equal((await fetch(`${base}/api/actions/effect-1`)).status, 401);
    assert.equal((await request('/api/action', a, { id: 'effect-1', revision: 1 })).status, 409);
    await request('/api/history', a, { locked: true });
    assert.equal((await request('/target/1')).status, 423);
    assert.equal((await (await request('/api/state')).json()).historyReady, false);
    await request('/api/expire', a, {});
    assert.equal((await request('/api/state')).status, 401);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
