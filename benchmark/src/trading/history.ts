import { Workspace } from './workspace.js';
import { readPage,type PageInput } from './paging.js';
export async function history(w:Workspace,state='',buyer='',input:PageInput={}) {
 return w.page('orders',{...input,state,buyer});
}
export async function timeline(w:Workspace,order:string,input:PageInput={}) {
 const o=await w.get('orders',order);
 return readPage(w.p,`SELECT a.* FROM trading.activity a WHERE a.seller_id=$1 AND
  (a.record_id IN($2,$3,$4) OR EXISTS(SELECT 1 FROM trading.drafts d WHERE d.seller_id=a.seller_id AND d.order_id=$2
   AND (a.record_id=d.id OR a.record_id=d.source_id OR a.source_id=d.source_id)))`,[w.seller,order,o.claim_id,o.conversation_id],JSON.stringify([w.seller,'timeline',order]),input,'activity');
}
export async function sharedInstructions(w:Workspace,order:string,input:PageInput={}) {
 await w.get('orders',order);
 return readPage(w.p,"SELECT d.id,d.created_at,d.instructions FROM trading.deliveries d JOIN trading.drafts p USING(seller_id,id) WHERE d.seller_id=$1 AND p.order_id=$2 AND p.kind='payment'",[w.seller,order],JSON.stringify([w.seller,'instructions',order]),input,'time');
}
