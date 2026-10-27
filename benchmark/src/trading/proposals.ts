import { randomUUID } from 'node:crypto';
import { activity,tx,type Client } from './db.js';
import { Workspace } from './workspace.js';
import { acceptOffer } from './negotiation.js';
import { integer } from './values.js';
import { lockItem,reconcileInventory } from './stock.js';
export async function blocked(c:Client,s:string,order:string) {
 return Boolean((await c.query(`SELECT 1 FROM trading.reviews r WHERE r.seller_id=$1 AND NOT r.resolved AND
 (r.order_id=$2 OR r.source_id IN (SELECT source_id FROM trading.drafts WHERE seller_id=$1 AND order_id=$2))
 AND r.reason<>'buyer payment evidence remains unverified' LIMIT 1`,[s,order])).rowCount);
}
export async function dependencies(c:Client,s:string,item:string|null,order:string|null,source:string|null) {
 const i=item?(await c.query('SELECT i.version,i.listing_id,v.version AS policy,l.version AS listing FROM trading.items i JOIN trading.inventory v ON(v.seller_id=i.seller_id AND v.id=i.inventory_id) JOIN trading.listings l ON(l.seller_id=i.seller_id AND l.id=i.listing_id) WHERE i.seller_id=$1 AND i.id=$2',[s,item])).rows[0]:null;
 const o=order?(await c.query('SELECT version FROM trading.orders WHERE seller_id=$1 AND id=$2',[s,order])).rows[0]:null;
 const src=source?(await c.query('SELECT hash FROM trading.inbox WHERE seller_id=$1 AND id=$2',[s,source])).rows[0]:null;
 return {item:i?.version??null,listing:i?.listing??null,policy:i?.policy??null,order:o?.version??null,source,hash:src?.hash??null};
}
export async function propose(c:Client,s:string,conversation:string,item:string|null,order:string|null,source:string|null,kind:string,text:string,extra:object={}) {
 const id=randomUUID(),deps={...await dependencies(c,s,item,order,source),...extra};
 await c.query('INSERT INTO trading.drafts(seller_id,id,conversation_id,item_id,order_id,source_id,kind,text,dependencies) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[s,id,conversation,item,order,source,kind,text,deps]);
 await activity(c,s,'response_proposed',id,1,'rules','',source);return id;
}
export async function approve(w:Workspace,id:string,version:number) {
 integer(version,1);
 return tx(w.p,async c=>{
  const ref=await w.get('drafts',id);
  if(ref.item_id){const {inv}=await lockItem(c,w.seller,ref.item_id);await reconcileInventory(c,w.seller,inv.id);}
  const d=(await c.query('SELECT * FROM trading.drafts WHERE seller_id=$1 AND id=$2 FOR UPDATE',[w.seller,id])).rows[0];
  if(d.state==='delivered')return 'delivered';
  if(d.version!==version||d.state!=='proposed')throw Error('stale-draft');
  const deps=await dependencies(c,w.seller,d.item_id,d.order_id,d.source_id);
  let stale=Object.entries(deps).some(([key,value])=>d.dependencies[key]!==value);
  if(d.source_id){const source=(await c.query('SELECT * FROM trading.inbox WHERE seller_id=$1 AND id=$2',[w.seller,d.source_id])).rows[0];
   stale ||= Boolean((await c.query('SELECT 1 FROM trading.inbox WHERE seller_id=$1 AND source=$2 AND epoch=$3 AND object_id=$4 AND revision>$5',[w.seller,source.source,source.epoch,source.object_id,source.revision])).rowCount);
   stale ||= Boolean((await c.query('SELECT 1 FROM trading.conflicts WHERE seller_id=$1 AND id=$2',[w.seller,d.source_id])).rowCount);
  }
  if(d.order_id){const o=(await c.query('SELECT o.state,r.state AS hold,r.expires_at>clock_timestamp() AS live FROM trading.orders o JOIN trading.reservations r USING(seller_id,id) WHERE o.seller_id=$1 AND o.id=$2 FOR UPDATE OF o,r',[w.seller,d.order_id])).rows[0];
   stale ||= await blocked(c,w.seller,d.order_id) || (o.state==='awaiting_payment' && (!o.live||o.hold!=='held')) || ['cancelled','expired'].includes(o.state);
  }
  if(!stale && d.kind==='offer'){ const order=await acceptOffer(c,w.seller,d); if(!order) stale=true; else { d.order_id=order; await c.query('UPDATE trading.drafts SET order_id=$3 WHERE seller_id=$1 AND id=$2',[w.seller,id,order]); } }
  if(stale){await c.query("UPDATE trading.drafts SET state='stale',version=version+1 WHERE seller_id=$1 AND id=$2",[w.seller,id]);return 'stale';}
  await c.query('INSERT INTO trading.deliveries(seller_id,id) VALUES($1,$2)',[w.seller,id]);
  await c.query("INSERT INTO trading.messages(seller_id,id,conversation_id,text,direction) VALUES($1,$2,$3,$4,'out')",[w.seller,id,d.conversation_id,d.text]);
  await activity(c,w.seller,'response_approved',id,version,'seller');
  await c.query("UPDATE trading.drafts SET state='delivered',version=version+1 WHERE seller_id=$1 AND id=$2",[w.seller,id]);
  await activity(c,w.seller,'response_delivered_to_fixture',id,version+1,'simulated-sink');return 'delivered';
 });
}
