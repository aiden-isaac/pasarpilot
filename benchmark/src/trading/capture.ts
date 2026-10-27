import { existsSync,readFileSync,readdirSync } from 'node:fs';
import { join } from 'node:path';
import type pg from 'pg';
import type PgBoss from 'pg-boss';
import { writeJson } from '../storage.js';
import { Ownership,readLease,holdLock,type Lease } from '../ownership.js';
import { podman } from '../container.js';
import { envelope,type Envelope } from './envelope.js';
import { intake } from './intake.js';
export function flushCapture(owner:Ownership,events:unknown) {
 owner.check();if(!Array.isArray(events)||events.length>50)throw Error('invalid-trading-capture');
 const payload=events.map(envelope);
 writeJson(join(owner.attemptPath,'trading-events.json'),{version:1,tenant:owner.lease.tenant,attempt:owner.lease.attempt,generation:owner.lease.generation,events:payload});
}
async function verified(root:string,attempt:string):Promise<Lease> {
 const lease=readLease(join(root,'attempts',attempt,'lease.json'));
 if(lease.attempt!==attempt||!['stored','reauth-required'].includes(lease.state)||lease.expires!==0||lease.container!==`pasarpilot-${attempt}`)throw Error('trading-handoff-not-released');
 const lock=await holdLock(join(root,'locks',`${lease.tenant}.lock`));
 try{if(podman(['ps','-q','--filter',`name=^${lease.container}$`]))throw Error('trading-producing-browser-alive');}
 finally{await new Promise<void>(r=>{lock.once('exit',()=>r());lock.stdin.end();});}
 return lease;
}
export async function importCapture(p:pg.Pool,boss:PgBoss,root:string,attempt:string,verify=verified,beforeAck=async()=>{}) {
 if(!/^[a-f0-9-]{36}$/.test(attempt))throw Error('invalid-attempt');
 const dir=join(root,'attempts',attempt),path=join(dir,'trading-events.json');
 if(!existsSync(path))return 0;
 const bytes=readFileSync(path,'utf8');if(Buffer.byteLength(bytes)>250000)throw Error('capture-too-large');
 const data=JSON.parse(bytes),lease=await verify(root,attempt);
 if(data.version!==1||data.attempt!==attempt||data.tenant!==lease.tenant||data.generation!==lease.generation||!Array.isArray(data.events)||data.events.length>50)throw Error('invalid-capture-owner');
 const events:Envelope[]=data.events.map(envelope);
 for(const event of events)if((await intake(p,boss,lease.tenant,event)).conflict)throw Error('capture-conflict-quarantined');
 await beforeAck();writeJson(join(dir,'trading-imported.json'),{version:1,attempt,count:events.length});return events.length;
}
export async function importHandoffs(p:pg.Pool,boss:PgBoss,root:string) {
 let count=0;
 for(const attempt of readdirSync(join(root,'attempts'))){
  if(existsSync(join(root,'attempts',attempt,'trading-imported.json')))continue;
  try{count+=await importCapture(p,boss,root,attempt);}catch(e){if(!/^(trading-handoff-not-released|profile-locked)$/.test((e as Error).message))throw e;}
 }return count;
}
