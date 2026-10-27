import { randomUUID } from 'node:crypto';
import { type Client,activity } from './db.js';
import { type Envelope } from './intake.js';
import { review } from './consumer.js';
export async function conversation(c:Client,s:string,id:string,ev:Envelope) {
 await c.query('INSERT INTO trading.conversations(seller_id,id,buyer,thread,item_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(seller_id,buyer,thread) DO NOTHING',[s,randomUUID(),ev.actor,ev.thread,ev.item]);
 const row=(await c.query('SELECT * FROM trading.conversations WHERE seller_id=$1 AND buyer=$2 AND thread=$3 FOR UPDATE',[s,ev.actor,ev.thread])).rows[0];
 const ambiguous=!ev.item || (row.item_id!==null && row.item_id!==ev.item);
 if(ambiguous) {await c.query('UPDATE trading.conversations SET item_id=NULL WHERE seller_id=$1 AND id=$2',[s,row.id]);await review(c,s,id,'unassociated or ambiguous conversation');}
 await c.query("INSERT INTO trading.messages(seller_id,id,conversation_id,text,direction) VALUES($1,$2,$3,$4,'in') ON CONFLICT DO NOTHING",[s,id,row.id,ev.text]);
 await activity(c,s,'message_received',row.id,ev.revision,ev.actor,'',id);
 return {...row,item_id:ambiguous?null:ev.item};
}
