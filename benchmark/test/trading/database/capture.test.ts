import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { accounts,id,trade } from './helpers.js';
import { pool,queue } from '../../../src/trading/db.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { Ownership } from '../../../src/ownership.js';
import { flushCapture,importCapture } from '../../../src/trading/capture.js';
import { synthetic } from '../../../src/trading/intake.js';
import { fixture } from '../../../src/fixture.js';
test('typed fixture payload and flushed sidecar replay intake after import/ack crash; unreleased capture is refused',async()=>{
 const [a]=await accounts(),p=pool(),b=queue(p);await b.start();const w=new Workspace(p,a.seller_id),t=await trade(w);
 const ev=synthetic({source:a.source,epoch:a.epoch},null as unknown as number,t.item),app=fixture({[a.tenant]:[ev]});await new Promise<void>(r=>app.listen(0,'127.0.0.1',r));const addr=app.address();assert.ok(addr&&typeof addr!=='string');
 const owner=await Ownership.acquire(mkdtempSync(join(tmpdir(),'wts-capture-')),a.tenant);
 try{
 const origin=`http://127.0.0.1:${addr.port}`,seed=await fetch(origin+'/seed/'+a.tenant,{method:'POST'});const payload=await (await fetch(origin+'/api/wts',{headers:{cookie:seed.headers.get('set-cookie')!.split(';')[0]!}})).json();assert.deepEqual(payload.events,[ev]);
 flushCapture(owner,payload.events);await assert.rejects(importCapture(p,b,owner.root,owner.lease.attempt),/not-released/);
 await owner.release(true);const verify=async()=>owner.lease;
 await assert.rejects(importCapture(p,b,owner.root,owner.lease.attempt,verify,async()=>{throw Error('ack-crash');}),/ack-crash/);
 assert.equal(await importCapture(p,b,owner.root,owner.lease.attempt,verify),1);assert.equal(await importCapture(p,b,owner.root,owner.lease.attempt,verify),1);
 assert.equal((await p.query('SELECT 1 FROM trading.inbox WHERE seller_id=$1 AND event_id=$2',[w.seller,ev.event])).rowCount,1);
 }finally{if(owner.lease.expires)await owner.release(true);app.closeAllConnections();await new Promise<void>(r=>app.close(()=>r()));await b.stop();await p.end();}
});
