import { Workspace } from './workspace.js';
import { text } from './values.js';
export async function history(w:Workspace,state='',buyer='') {
 if(state&&!['awaiting_payment','paid','completed','cancelled','expired'].includes(state))throw Error('invalid-history-state');
 if(buyer)text(buyer);
 return (await w.p.query('SELECT id,buyer,item_id,state,payment,fulfilment,quantity,unit_price,total,version FROM trading.orders WHERE seller_id=$1 AND ($2=\'\' OR state=$2) AND ($3=\'\' OR buyer=$3) ORDER BY id LIMIT 200',[w.seller,state,buyer])).rows;
}
export async function timeline(w:Workspace,order:string) {
 const o=await w.get('orders',order);
 const drafts=(await w.p.query('SELECT id,source_id FROM trading.drafts WHERE seller_id=$1 AND order_id=$2',[w.seller,order])).rows;
 const sources=drafts.map(d=>d.source_id).filter(Boolean);
 const refs=[o.id,o.claim_id,o.conversation_id,...drafts.map(d=>d.id),...sources];
 return (await w.p.query('SELECT * FROM (SELECT * FROM trading.activity WHERE seller_id=$1 AND (record_id=ANY($2::text[]) OR source_id=ANY($3::text[])) ORDER BY id DESC LIMIT 200) a ORDER BY id',[w.seller,refs,sources])).rows;
}
export async function sharedInstructions(w:Workspace,order:string) {
 await w.get('orders',order);
 return (await w.p.query("SELECT d.id,d.created_at,d.instructions FROM trading.deliveries d JOIN trading.drafts p USING(seller_id,id) WHERE d.seller_id=$1 AND p.order_id=$2 AND p.kind='payment' ORDER BY d.created_at",[w.seller,order])).rows;
}
