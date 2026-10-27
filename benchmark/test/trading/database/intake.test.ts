import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accounts,id } from './helpers.js';
import { pool,queue } from '../../../src/trading/db.js';
import { intake,synthetic } from '../../../src/trading/intake.js';
test('atomic inbox wake-up deduplicates and quarantines conflicts; malformed foreign and enqueue failure roll back',async()=>{
 const [a]=await accounts(),p=pool(),b=queue(p);await b.start();try{
 const ev=synthetic({source:a.source,epoch:a.epoch},null as unknown as number,id());
 const r=await intake(p,b,a.tenant,ev);assert.ok((await intake(p,b,a.tenant,ev)).duplicate);
 assert.ok((await intake(p,b,a.tenant,{...ev,text:'different'})).conflict);
 await assert.rejects(intake(p,b,a.tenant,{...ev,seller_id:'forged'}));await assert.rejects(intake(p,b,'seller-b',ev));
 const send=b.send.bind(b); b.send=async()=>{throw Error('injected-enqueue');}; const bad={...ev,event:id(),object:id()};
 try{await assert.rejects(intake(p,b,a.tenant,bad),/injected/);}finally{b.send=send;}
 assert.equal((await p.query('SELECT 1 FROM trading.inbox WHERE seller_id=$1 AND event_id=$2',[a.seller_id,bad.event])).rowCount,0);
 assert.equal((await p.query('SELECT 1 FROM trading.inbox WHERE seller_id=$1 AND id=$2',[a.seller_id,r.id])).rowCount,1);
 }finally{await b.stop();await p.end();}
});
