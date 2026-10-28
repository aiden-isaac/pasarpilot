import { Workspace } from './workspace.js';
import { readPage,type PageInput } from './paging.js';
export async function history(w:Workspace,state='',buyer='',input:PageInput={}) {
 return w.page('orders',{...input,state,buyer});
}
export async function timeline(w:Workspace,order:string,input:PageInput={}) {
 const o=await w.get('orders',order);
 return readPage(w.p,`SELECT a.* FROM trading.activity a WHERE a.seller_id=$1 AND
  (a.record_id IN($2,$3,$4)
   OR a.record_id IN(SELECT id FROM trading.drafts WHERE seller_id=$1 AND order_id=$2
    UNION ALL SELECT source_id FROM trading.drafts WHERE seller_id=$1 AND order_id=$2)
   OR a.source_id IN(SELECT source_id FROM trading.drafts WHERE seller_id=$1 AND order_id=$2))`,[w.seller,order,o.claim_id,o.conversation_id],JSON.stringify([w.seller,'timeline',order]),input,'activity');
}
export async function sharedInstructions(w:Workspace,order:string,input:PageInput={}) {
 await w.get('orders',order);
 return readPage(w.p,"SELECT d.id,d.created_at,d.instructions FROM trading.deliveries d JOIN trading.drafts p USING(seller_id,id) WHERE d.seller_id=$1 AND p.order_id=$2 AND p.kind='payment'",[w.seller,order],JSON.stringify([w.seller,'instructions',order]),input,'time');
}
