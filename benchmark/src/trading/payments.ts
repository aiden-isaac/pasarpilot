import { tx,activity } from './db.js';
import { Workspace } from './workspace.js';
import { integer,text,total } from './values.js';
import { lockItem,reconcileInventory,orderReview,settleBackups } from './stock.js';
import { blocked,propose } from './proposals.js';
import { response } from './rules.js';
export async function instructions(w:Workspace,version:number,value:string,approved:boolean) {
 text(value,2000);integer(version,1);
 await tx(w.p,async c=>{
  const r=await c.query('UPDATE trading.sellers SET instructions=$3,instructions_approved=$4,instruction_version=instruction_version+1 WHERE id=$1 AND instruction_version=$2 RETURNING instruction_version',[w.seller,version,value,approved]);
  if(!r.rowCount)throw Error('stale-instructions');await activity(c,w.seller,'instructions_configured',w.seller,r.rows[0].instruction_version,'seller',approved?'approved for sharing':'not approved');
 });
}
export async function terms(w:Workspace,id:string,version:number,method:'collection'|'cod'|'postage'|'drop_off',fee:number|null) {
 if(!['collection','cod','postage','drop_off'].includes(method))throw Error('invalid-fulfilment-method');
 if(fee!==null)integer(fee);if(['collection','cod','drop_off'].includes(method)&&fee!==0)throw Error('invalid-nonpostage-fee');
 const error=await tx(w.p,async c=>{
  const ref=await w.get('orders',id),{inv}=await lockItem(c,w.seller,ref.item_id);await reconcileInventory(c,w.seller,inv.id);
  const o=(await c.query('SELECT * FROM trading.orders WHERE seller_id=$1 AND id=$2 FOR UPDATE',[w.seller,id])).rows[0];
  if(o.state!=='awaiting_payment'||o.version!==integer(version,1))return 'stale-order-or-expired';
  const due=fee===null?null:total(o.unit_price,o.quantity,fee);
  await c.query("UPDATE trading.orders SET fee=$3,total=$4,arrangement=$5,fulfilment='arranged',version=version+1 WHERE seller_id=$1 AND id=$2",[w.seller,id,fee,due,{method}]);
  await activity(c,w.seller,'fulfilment_terms_agreed',id,o.version+1,'seller');
 });if(error)throw Error(error);
}
export async function paymentDraft(w:Workspace,id:string,version:number) {
 const result=await tx(w.p,async c=>{
  const ref=await w.get('orders',id),{inv}=await lockItem(c,w.seller,ref.item_id);await reconcileInventory(c,w.seller,inv.id);
  const o=(await c.query('SELECT o.*,r.state AS hold,r.expires_at>clock_timestamp() AS live FROM trading.orders o JOIN trading.reservations r USING(seller_id,id) WHERE o.seller_id=$1 AND o.id=$2 FOR UPDATE OF o,r',[w.seller,id])).rows[0];
  const config=(await c.query('SELECT * FROM trading.sellers WHERE id=$1 FOR SHARE',[w.seller])).rows[0];
  if(o.version!==integer(version,1)||o.state!=='awaiting_payment'||o.hold!=='held'||!o.live||await blocked(c,w.seller,id))return {error:'stale-order-or-review'};
  if(o.total===null||o.fee===null||!config.instructions_approved||!config.instructions)return {error:'instructions-or-agreed-fee-required'};
  const prior=(await c.query("SELECT id FROM trading.drafts WHERE seller_id=$1 AND order_id=$2 AND kind='payment' AND state='proposed' AND dependencies->>'order'=$3 AND dependencies->>'instruction'=$4",[w.seller,id,String(o.version),String(config.instruction_version)])).rows[0];
  if(prior)return {id:prior.id};
  const key=await propose(c,w.seller,o.conversation_id,o.item_id,o.id,null,'payment',response('payment',{amount:o.total,instructions:config.instructions}),{instruction:config.instruction_version,instruction_snapshot:config.instructions,amount:o.total,agreement:o.agreement,fee:o.fee});
  return {id:key};
 });if(result.error)throw Error(result.error);return result.id as string;
}
export async function confirmPayment(w:Workspace,id:string,version:number,amount:number,trusted:boolean) {
 integer(amount);integer(version,1);if(!trusted)throw Error('payment-trusted-account-attestation-required');
 return tx(w.p,async c=>{
  const ref=await w.get('orders',id);const {inv}=await lockItem(c,w.seller,ref.item_id);await reconcileInventory(c,w.seller,inv.id);
  const o=(await c.query('SELECT o.*,r.state AS hold,r.expires_at>clock_timestamp() AS live FROM trading.orders o JOIN trading.reservations r USING(seller_id,id) WHERE o.seller_id=$1 AND o.id=$2 FOR UPDATE OF o,r',[w.seller,id])).rows[0];
  if(o.payment==='seller_verified'&&o.total===amount)return 'seller_verified';
  if(o.state!=='awaiting_payment'||o.hold!=='held'||!o.live){await orderReview(c,w.seller,id,'late or terminal payment requires reconciliation');return 'review';}
  if(o.version!==version)throw Error('stale-order');
  if(o.total===null||amount!==o.total){await orderReview(c,w.seller,id,'payment amount discrepancy');return 'review';}
  if(await blocked(c,w.seller,id))return 'review';
  if(!(await c.query("SELECT 1 FROM trading.deliveries d JOIN trading.drafts p USING(seller_id,id) WHERE d.seller_id=$1 AND p.order_id=$2 AND p.kind='payment' AND (d.instructions->>'amount')::int=$3 AND d.instructions->'agreement'=$4::jsonb",[w.seller,id,amount,JSON.stringify(o.agreement)])).rowCount)throw Error('payment-approved-request-required');
  await c.query('UPDATE trading.inventory SET unsold=unsold-$3,reserved=reserved-$3 WHERE seller_id=$1 AND id=$2',[w.seller,inv.id,o.quantity]);
  await c.query("UPDATE trading.reservations SET state='committed' WHERE seller_id=$1 AND id=$2",[w.seller,id]);
  await c.query("UPDATE trading.orders SET state='paid',payment='seller_verified',verified_at=clock_timestamp(),version=version+1 WHERE seller_id=$1 AND id=$2",[w.seller,id]);
  await activity(c,w.seller,'payment_verified_and_stock_committed',id,o.version+1,'seller','trusted account checked; exact due amount');
  const related=(await c.query('SELECT id FROM trading.items WHERE seller_id=$1 AND inventory_id=$2 ORDER BY id',[w.seller,inv.id])).rows;
  for(const row of related)await settleBackups(c,w.seller,row.id);
  return 'seller_verified';
 });
}
