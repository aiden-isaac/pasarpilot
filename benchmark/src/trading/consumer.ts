import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { tx,activity,type Client } from './db.js';
import { envelope,type Envelope } from './intake.js';
export type Handler=(c:Client,seller:string,id:string,ev:Envelope)=>Promise<string>;
export async function review(c:Client,s:string,source:string,reason:string,order:string|null=null) {
 const id=randomUUID(); await c.query('INSERT INTO trading.reviews(seller_id,id,source_id,order_id,reason) VALUES($1,$2,$3,$4,$5)',[s,id,source,order,reason]);
 await activity(c,s,'review_opened',id,1,'source',reason,source);return id;
}
export async function processStream(p:pg.Pool,s:string,source:string,epoch:string,handle:Handler=async()=> 'observed') {
 return tx(p,async c=>{
  if(!(await c.query('SELECT 1 FROM trading.sources WHERE seller_id=$1 AND source=$2 AND epoch=$3',[s,source,epoch])).rowCount) throw Error('invalid-stream-scope');
  await c.query('INSERT INTO trading.streams(seller_id,source,epoch) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[s,source,epoch]);
  let cursor=(await c.query('SELECT cursor FROM trading.streams WHERE seller_id=$1 AND source=$2 AND epoch=$3 FOR UPDATE',[s,source,epoch])).rows[0].cursor;
  const unknown=(await c.query("SELECT * FROM trading.inbox WHERE seller_id=$1 AND source=$2 AND epoch=$3 AND position IS NULL AND result='pending' ORDER BY id LIMIT 50",[s,source,epoch])).rows;
  for(const row of unknown){await review(c,s,row.id,'unknown source ordering');await c.query("UPDATE trading.inbox SET result='review' WHERE seller_id=$1 AND id=$2",[s,row.id]);}
  for(let count=0;count<100;count++) {
   const row=(await c.query('SELECT * FROM trading.inbox WHERE seller_id=$1 AND source=$2 AND epoch=$3 AND position=$4',[s,source,epoch,cursor+1])).rows[0];
   if(!row) break; const ev=envelope(row.envelope);
   if(ev.item){const item=(await c.query('SELECT * FROM trading.items WHERE seller_id=$1 AND id=$2',[s,ev.item])).rows[0];
    if(!item) break;
    if(ev.parent!==ev.item || (ev.post!==null && ev.post!==item.listing_id)){await review(c,s,row.id,'invalid parent mapping');await c.query("UPDATE trading.inbox SET result='review' WHERE seller_id=$1 AND id=$2",[s,row.id]);cursor++;continue;}
   }
   const prior=(await c.query('SELECT * FROM trading.inbox WHERE seller_id=$1 AND source=$2 AND epoch=$3 AND object_id=$4 AND id<>$5 AND result<>\'pending\' ORDER BY revision DESC LIMIT 1',[s,source,epoch,ev.object,row.id])).rows[0];
   let result:string;
   if(prior || ev.deleted || ev.revision!==1){
    const order=(await c.query('SELECT id FROM trading.orders WHERE seller_id=$1 AND claim_id=$2',[s,prior?.id])).rows[0];
    await review(c,s,row.id,'source edited/deleted; prior agreement retained',order?.id??null);
    await c.query("UPDATE trading.drafts SET state='stale',version=version+1 WHERE seller_id=$1 AND source_id=$2 AND state='proposed'",[s,prior?.id]);result='review';
   }else result=await handle(c,s,row.id,ev);
   await c.query('UPDATE trading.inbox SET result=$3 WHERE seller_id=$1 AND id=$2',[s,row.id,result]);
   await activity(c,s,'event_processed',row.id,ev.revision,'source',result,ev.event);cursor++;
  }
  await c.query('UPDATE trading.streams SET cursor=$4 WHERE seller_id=$1 AND source=$2 AND epoch=$3',[s,source,epoch,cursor]);return cursor;
 });
}
