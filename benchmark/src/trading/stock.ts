import { randomUUID } from 'node:crypto';
import { activity,type Client } from './db.js';
import { integer,snapshot,total } from './values.js';
import { response } from './rules.js';
import { review,type Handler } from './consumer.js';
import { conversation } from './conversation.js';
import { classify } from './claims.js';
export async function lockItem(c:Client,s:string,item:string) {
 const ref=(await c.query('SELECT inventory_id,listing_id FROM trading.items WHERE seller_id=$1 AND id=$2',[s,item])).rows[0];
 if(!ref) throw Error('not-found');
 const inv=(await c.query('SELECT * FROM trading.inventory WHERE seller_id=$1 AND id=$2 FOR UPDATE',[s,ref.inventory_id])).rows[0];
 const post=(await c.query('SELECT * FROM trading.listings WHERE seller_id=$1 AND id=$2 FOR UPDATE',[s,ref.listing_id])).rows[0];
 const row=(await c.query('SELECT * FROM trading.items WHERE seller_id=$1 AND id=$2 FOR UPDATE',[s,item])).rows[0];
 return {inv,post,item:row};
}
export type ClaimRequest={id:string;item:string;buyer:string;conversation:string;quantity:number;position:number;kind:'claim'|'backup';source?:string|null};
export async function allocate(c:Client,s:string,r:ClaimRequest,price?:number) {
 integer(r.quantity,1);integer(r.position,1);
 const {inv,post,item}=await lockItem(c,s,r.item);
 const old=(await c.query('SELECT * FROM trading.orders WHERE seller_id=$1 AND claim_id=$2',[s,r.id])).rows[0];
 if(old) return old.state==='awaiting_payment'?'primary':old.state;
 const prior=(await c.query('SELECT state FROM trading.claims WHERE seller_id=$1 AND id=$2',[s,r.id])).rows[0];
 if(prior && prior.state!=='backup') return prior.state;
 const repeated=(await c.query("SELECT 1 FROM trading.orders WHERE seller_id=$1 AND item_id=$2 AND buyer=$3 AND state IN ('awaiting_payment','paid')",[s,r.item,r.buyer])).rowCount;
 const state=repeated?'review':post.open && item.open && r.kind==='claim' && inv.unsold-inv.reserved>=r.quantity && item.offered-item.allocated>=r.quantity?'primary':'backup';
 const unit=price??item.price;total(unit,r.quantity);
 await c.query('INSERT INTO trading.claims(seller_id,id,item_id,buyer,conversation_id,quantity,position,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(seller_id,id) DO UPDATE SET state=EXCLUDED.state,version=trading.claims.version+1',[s,r.id,r.item,r.buyer,r.conversation,r.quantity,r.position,state]);
 if(state==='review') {if(r.source) await review(c,s,r.source,'repeated active buyer/item claim');return state;}
 let order:string|null=null;
 if(state==='primary') {
  order=r.id;
  await c.query('UPDATE trading.inventory SET reserved=reserved+$3 WHERE seller_id=$1 AND id=$2',[s,inv.id,r.quantity]);
  await c.query('UPDATE trading.items SET allocated=allocated+$3 WHERE seller_id=$1 AND id=$2',[s,item.id,r.quantity]);
  await c.query('INSERT INTO trading.orders(seller_id,id,claim_id,item_id,buyer,conversation_id,quantity,unit_price,agreement) VALUES($1,$2,$2,$3,$4,$5,$6,$7,$8)',[s,order,r.item,r.buyer,r.conversation,r.quantity,unit,snapshot(inv,r.quantity,unit)]);
  await c.query('INSERT INTO trading.reservations(seller_id,id) VALUES($1,$2)',[s,order]);
 }
 const dependencies={item:item.version,listing:post.version,policy:inv.version,order:order?1:null,source:r.source??null};
 const draft=randomUUID();await c.query('INSERT INTO trading.drafts(seller_id,id,conversation_id,order_id,item_id,source_id,kind,text,dependencies) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[s,draft,r.conversation,order,r.item,r.source??null,state==='primary'?'claim':'backup',response(state==='primary'?'claim':'backup',{quantity:r.quantity}),dependencies]);
 await activity(c,s,state==='primary'?'hold_created':'backup_queued',r.id,1,r.buyer,'',r.source??null);
 await activity(c,s,'response_proposed',draft,1,'rules','',r.source??null);
 return state;
}
export const handle:Handler=async(c,s,id,ev)=>{
 const conv=await conversation(c,s,id,ev),parsed=await classify(c,s,ev);
 if(ev.kind==='payment_evidence') {await review(c,s,id,'buyer payment evidence remains unverified');return 'unverified';}
 if(!conv.item_id||parsed.kind==='review'){await review(c,s,id,'claim needs explicit interpretation');return 'review';}
 if(parsed.kind==='inquiry') return 'inquiry';
 return allocate(c,s,{id,item:ev.item!,buyer:ev.actor,conversation:conv.id,quantity:parsed.quantity,position:ev.position!,kind:parsed.kind,source:id});
};
export async function promote(c:Client,s:string,itemId:string,claimId?:string) {
 const {inv,post,item}=await lockItem(c,s,itemId);
 if(!post.open||!item.open) return;
 const candidates=(await c.query("SELECT * FROM trading.claims WHERE seller_id=$1 AND item_id=$2 AND state='backup' AND ($3::text IS NULL OR id=$3) ORDER BY position,id",[s,itemId,claimId??null])).rows;
 for(const claim of candidates) {
  if(claim.quantity>inv.unsold-inv.reserved||claim.quantity>item.offered-item.allocated) continue;
  if((await c.query("SELECT 1 FROM trading.orders WHERE seller_id=$1 AND item_id=$2 AND buyer=$3 AND state IN ('awaiting_payment','paid')",[s,itemId,claim.buyer])).rowCount) continue;
  return allocate(c,s,{id:claim.id,item:itemId,buyer:claim.buyer,conversation:claim.conversation_id,quantity:claim.quantity,position:claim.position,kind:'claim'});
 }
}
export async function settleBackups(c:Client,s:string,itemId:string) {
 const {inv,item}=await lockItem(c,s,itemId);
 const held=(await c.query("SELECT 1 FROM trading.orders o JOIN trading.reservations r USING(seller_id,id) WHERE o.seller_id=$1 AND o.item_id=$2 AND r.state='held'",[s,itemId])).rowCount;
 if(!held && (inv.unsold===0||item.allocated===item.offered)) {
  const rows=(await c.query("UPDATE trading.claims SET state='unfulfilled',version=version+1 WHERE seller_id=$1 AND item_id=$2 AND state='backup' RETURNING id,version",[s,itemId])).rows;
  for(const r of rows) await activity(c,s,'backup_unfulfilled',r.id,r.version,'rules','sold out');
 }
}
