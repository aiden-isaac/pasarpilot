import { createHash,randomUUID } from 'node:crypto';
import type pg from 'pg';
import type PgBoss from 'pg-boss';
import { tx,activity } from './db.js';
import { envelope,type Envelope } from './envelope.js';
export { envelope,type Envelope } from './envelope.js';
export async function intake(p:pg.Pool,boss:PgBoss,tenant:string,value:unknown) {
 const ev=envelope(value),hash=createHash('sha256').update(JSON.stringify(ev)).digest('hex');
 return tx(p,async c=>{
  const mapping=(await c.query('SELECT * FROM trading.sources WHERE tenant=$1 FOR UPDATE',[tenant])).rows[0];
  if(!mapping||mapping.source!==ev.source||mapping.epoch!==ev.epoch) throw Error('invalid-source-mapping');
  const s=mapping.seller_id;
  if(!(await c.query('SELECT 1 FROM trading.actors WHERE seller_id=$1 AND id=$2',[s,ev.actor])).rowCount) throw Error('invalid-actor');
  const old=(await c.query('SELECT * FROM trading.inbox WHERE seller_id=$1 AND source=$2 AND epoch=$3 AND event_id=$4 AND revision=$5',[s,ev.source,ev.epoch,ev.event,ev.revision])).rows[0];
  if(old){
   if(old.hash!==hash){
    const r=await c.query('INSERT INTO trading.conflicts VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[s,old.id,hash]);
    if(r.rowCount){await c.query('INSERT INTO trading.reviews(seller_id,id,source_id,reason) VALUES($1,$2,$3,$4)',[s,randomUUID(),old.id,'conflicting event identity']);await activity(c,s,'event_quarantined',old.id,ev.revision,'source','conflicting content',ev.event);}
    return {id:old.id,conflict:true};
   }
   return {id:old.id,duplicate:true};
  }
  const id=randomUUID();
  await c.query('INSERT INTO trading.inbox(seller_id,id,source,epoch,event_id,revision,position,object_id,envelope,hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[s,id,ev.source,ev.epoch,ev.event,ev.revision,ev.position,ev.object,ev,hash]);
  const job=await boss.send('inbox',{seller:s,source:ev.source,epoch:ev.epoch},{db:{executeSql:(q,v)=>c.query(q,v)},retryLimit:5,retryDelay:5});
  if(!job) throw Error('inbox-wakeup-failed');
  await activity(c,s,'event_accepted',id,ev.revision,'source','',ev.event);
  return {id,duplicate:false};
 });
}
export function synthetic(mapping:{source:string;epoch:string},position:number,item:string,actor='buyer-a',message='claim',event=randomUUID()):Envelope {
 return {version:1,...mapping,event,object:event,revision:1,position,kind:'reply',actor,post:null,item,parent:item,thread:`thread-${actor}-${item}`,sourceTime:new Date().toISOString(),text:message,deleted:false};
}
