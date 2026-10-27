import { tx,activity } from './db.js';
import { Workspace } from './workspace.js';
import { integer,text } from './values.js';
import { lockItem,reconcileInventory } from './stock.js';
import { blocked,propose } from './proposals.js';
import { response } from './rules.js';
export type Details={location?:string;time?:string;recipient?:string;address?:string;tracking?:string};
export async function arrange(w:Workspace,id:string,version:number,details:Details) {
 const error=await tx(w.p,async c=>{
  const ref=await w.get('orders',id),{inv}=await lockItem(c,w.seller,ref.item_id);await reconcileInventory(c,w.seller,inv.id);
  const o=(await c.query('SELECT * FROM trading.orders WHERE seller_id=$1 AND id=$2 FOR UPDATE',[w.seller,id])).rows[0];
  if(!['awaiting_payment','paid'].includes(o.state)||o.version!==integer(version,1))return 'stale-order';
  if(!o.arrangement?.method)throw Error('fulfilment-agreed-method-required');
  const data:Record<string,string>={method:o.arrangement.method};
  if(data.method==='postage'){data.recipient=text(details.recipient);data.address=text(details.address,1000);if(details.tracking)data.tracking=text(details.tracking);}
  else{data.location=text(details.location);data.time=text(details.time);if(!Number.isFinite(Date.parse(data.time)))throw Error('invalid-meeting-time');}
  await c.query('UPDATE trading.orders SET arrangement=$3,version=version+1 WHERE seller_id=$1 AND id=$2',[w.seller,id,{...data,previous:o.arrangement}]);
  await activity(c,w.seller,'fulfilment_arrangement_recorded',id,o.version+1,'seller');
 });if(error)throw Error(error);
}
export async function fulfil(w:Workspace,id:string,version:number,status:string,evidence:string) {
 text(evidence,1000);integer(version,1);
 return tx(w.p,async c=>{
  const ref=await w.get('orders',id);await lockItem(c,w.seller,ref.item_id);
  const o=(await c.query('SELECT * FROM trading.orders WHERE seller_id=$1 AND id=$2 FOR UPDATE',[w.seller,id])).rows[0];
  if(o.fulfilment===status&&o.payment==='seller_verified')return status;
  if(o.version!==version||o.state!=='paid'||o.payment!=='seller_verified'||await blocked(c,w.seller,id))throw Error('fulfilment-payment-or-review-conflict');
  const method=o.arrangement?.method;
  const valid=method==='postage'?((o.fulfilment==='arranged'&&status==='posted')||(o.fulfilment==='posted'&&status==='delivered')):
   method==='drop_off'?((o.fulfilment==='arranged'&&status==='dropped_off')||(o.fulfilment==='dropped_off'&&status==='collected')):
   ['collection','cod'].includes(method)&&o.fulfilment==='arranged'&&status==='collected';
  if(!valid)throw Error('invalid-fulfilment-transition');
  if(method==='postage'&&(!o.arrangement.recipient||!o.arrangement.address||!o.arrangement.tracking))throw Error('fulfilment-recipient-address-tracking-required');
  if(method!=='postage'&&(!o.arrangement.location||!o.arrangement.time))throw Error('fulfilment-location-time-required');
  await c.query('UPDATE trading.orders SET fulfilment=$3,version=version+1 WHERE seller_id=$1 AND id=$2',[w.seller,id,status]);
  await activity(c,w.seller,'fulfilment_'+status,id,version+1,'seller',evidence);
  await propose(c,w.seller,o.conversation_id,o.item_id,o.id,null,'fulfilment',response('fulfilment',{status}));return status;
 });
}
export async function complete(w:Workspace,id:string,version:number) {
 integer(version,1);return tx(w.p,async c=>{
  const ref=await w.get('orders',id);await lockItem(c,w.seller,ref.item_id);
  const o=(await c.query('SELECT * FROM trading.orders WHERE seller_id=$1 AND id=$2 FOR UPDATE',[w.seller,id])).rows[0];
  if(o.state==='completed')return 'completed';
  if(o.version!==version||o.state!=='paid'||o.payment!=='seller_verified'||!['collected','delivered'].includes(o.fulfilment)||await blocked(c,w.seller,id))throw Error('invalid-completion-payment-or-fulfilment');
  await c.query("UPDATE trading.orders SET state='completed',version=version+1 WHERE seller_id=$1 AND id=$2",[w.seller,id]);
  await c.query("UPDATE trading.claims SET state='fulfilled',version=version+1 WHERE seller_id=$1 AND id=$2",[w.seller,o.claim_id]);
  await activity(c,w.seller,'order_completed',id,version+1,'seller','actual fulfilment confirmed');return 'completed';
 });
}
