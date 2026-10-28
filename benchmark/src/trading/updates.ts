import { Workspace } from './workspace.js';
export async function updates(w:Workspace,url:URL){
 if(url.search.length>128||[...url.searchParams.keys()].some(k=>k!=='limit')||url.searchParams.getAll('limit').length>1)throw Error('invalid-update-query');
 const raw=url.searchParams.get('limit')??'20';if(!/^[1-9]\d?$/.test(raw)||Number(raw)>20)throw Error('invalid-update-limit');
 // Re-read the current window: identity allocation order is not commit order.
 const recent=(await w.p.query('SELECT id,action,record_id,actor,created_at FROM trading.activity WHERE seller_id=$1 ORDER BY id DESC LIMIT $2',[w.seller,Number(raw)])).rows;
 const attention=(await w.p.query(`
  (SELECT id,'review' AS kind,version FROM trading.reviews WHERE seller_id=$1 AND NOT resolved ORDER BY id LIMIT 5)
  UNION ALL (SELECT id,'response' AS kind,version FROM trading.drafts WHERE seller_id=$1 AND state='proposed' ORDER BY id LIMIT 5)
  UNION ALL (SELECT id,'payment' AS kind,version FROM trading.orders WHERE seller_id=$1 AND state='awaiting_payment' ORDER BY id LIMIT 5)
  UNION ALL (SELECT id,'fulfilment' AS kind,version FROM trading.orders WHERE seller_id=$1 AND state='paid' ORDER BY id LIMIT 5)`,[w.seller])).rows;
 return {checkedAt:new Date().toISOString(),recent,attention};
}
