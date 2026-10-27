import { randomUUID } from 'node:crypto';
import { activity,tx,type Client } from './db.js';
import { Workspace } from './workspace.js';
import { integer,sen,total,snapshot } from './values.js';
import { propose } from './proposals.js';
import { allocate,lockItem,reconcileInventory } from './stock.js';
import { response } from './rules.js';
import { review } from './consumer.js';
import type { Envelope } from './intake.js';
export async function policy(w:Workspace,id:string,version:number,minimum:number|null) {
 if(minimum!==null)integer(minimum);integer(version,1);
 await tx(w.p,async c=>{
  const r=await c.query('UPDATE trading.inventory SET minimum=$3,version=version+1 WHERE seller_id=$1 AND id=$2 AND version=$4 AND ($3::int IS NULL OR $3<=price) RETURNING version',[w.seller,id,minimum,version]);
  if(!r.rowCount)throw Error('stale-or-invalid-negotiation-policy');await activity(c,w.seller,'negotiation_policy_changed',id,r.rows[0].version);
 });
}
export async function offer(c:Client,s:string,id:string,ev:Envelope,conversation:string) {
 const m=/^offer (?:RM|MYR )?((?:0|[1-9]\d*)(?:\.\d{1,2})?)$/i.exec(ev.text);
 if(!m||!ev.item||!ev.position){await review(c,s,id,'unsupported offer terms');return 'review';}
 let unit:number;try{unit=sen(m[1]!);}catch{await review(c,s,id,'invalid offer amount');return 'review';}
 const {inv,item}=await lockItem(c,s,ev.item);
 if(inv.minimum===null||unit<inv.minimum) {
  await propose(c,s,conversation,item.id,null,id,'price',response('price',{amount:item.price}));return 'counter_proposed';
 }
 await propose(c,s,conversation,item.id,null,id,'offer',response('price',{amount:unit}),{offer:{unit,quantity:1,buyer:ev.actor,position:ev.position}});return 'acceptance_proposed';
}
export async function acceptOffer(c:Client,s:string,d:Record<string,any>):Promise<string|undefined> {
 const {inv,post,item}=await lockItem(c,s,d.item_id);await reconcileInventory(c,s,inv.id);
 const offer=d.dependencies.offer;integer(offer.unit);integer(offer.quantity,1);
 if(!post.open||!item.open||inv.minimum===null||offer.unit<inv.minimum) return;
 const o=(await c.query("SELECT o.*,r.expires_at>clock_timestamp() AS live,r.state AS hold FROM trading.orders o JOIN trading.reservations r USING(seller_id,id) WHERE o.seller_id=$1 AND o.item_id=$2 AND o.buyer=$3 AND o.state IN ('awaiting_payment','paid') FOR UPDATE OF o,r",[s,item.id,offer.buyer])).rows[0];
 if(o) {
  if(o.state!=='awaiting_payment'||!o.live||o.hold!=='held')return;
  const amount=o.fee===null?null:total(offer.unit,o.quantity,o.fee);
  await c.query('UPDATE trading.orders SET unit_price=$3,total=$4,agreement=$5,version=version+1 WHERE seller_id=$1 AND id=$2',[s,o.id,offer.unit,amount,{...snapshot(inv,o.quantity,offer.unit),previous:o.agreement}]);
  await activity(c,s,'negotiated_agreement',o.id,o.version+1,'seller','explicit approved amendment',d.source_id);return o.id;
 }
 const fresh=(await c.query('SELECT * FROM trading.inventory WHERE seller_id=$1 AND id=$2',[s,inv.id])).rows[0];
 if(fresh.unsold-fresh.reserved<offer.quantity||item.offered-item.allocated<offer.quantity)return;
 const id=randomUUID();
 if(await allocate(c,s,{id,item:item.id,buyer:offer.buyer,conversation:d.conversation_id,quantity:offer.quantity,position:offer.position,kind:'claim',source:d.source_id},offer.unit)!=='primary')throw Error('unavailable-offer');
 return id;
}
