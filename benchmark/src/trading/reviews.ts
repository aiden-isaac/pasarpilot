import { randomUUID } from 'node:crypto';
import { tx,activity } from './db.js';
import { Workspace } from './workspace.js';
import { integer,text } from './values.js';
import { envelope } from './intake.js';
import { conversation } from './conversation.js';
import { allocate,lockItem,promote,release } from './stock.js';
export async function resolve(w:Workspace,id:string,version:number,action:'claim'|'backup'|'associate'|'reject',item:string,buyer:string,qty:number,reason:string) {
 text(reason,1000);integer(version,1);
 return tx(w.p,async c=>{
  if(action!=='reject') {integer(qty,1);await lockItem(c,w.seller,item);}
  const r=(await c.query('SELECT * FROM trading.reviews WHERE seller_id=$1 AND id=$2 FOR UPDATE',[w.seller,id])).rows[0];
  if(!r)throw Error('not-found');if(r.resolved||r.version!==version)throw Error('stale-review');
  let result='rejected';
  if(action!=='reject') {
   const src=(await c.query('SELECT * FROM trading.inbox WHERE seller_id=$1 AND id=$2',[w.seller,r.source_id])).rows[0];
   if(!src)throw Error('invalid-source-review');
   if(!(await c.query('SELECT 1 FROM trading.actors WHERE seller_id=$1 AND id=$2',[w.seller,buyer])).rowCount)throw Error('invalid-buyer');
   const ev={...envelope(src.envelope),actor:buyer,item,parent:item};
   const conv=await conversation(c,w.seller,src.id,ev);
   await c.query('UPDATE trading.conversations SET item_id=$3 WHERE seller_id=$1 AND id=$2',[w.seller,conv.id,item]);
   result=action==='associate'?'associated':await allocate(c,w.seller,{id:randomUUID(),item,buyer,conversation:conv.id,quantity:qty,position:ev.position??2147483647,kind:action,source:src.id});
  } else if(r.source_id) {
   await c.query("UPDATE trading.claims SET state='withdrawn',version=version+1 WHERE seller_id=$1 AND id=$2 AND state IN ('backup','review')",[w.seller,r.source_id]);
  }
  await c.query('UPDATE trading.reviews SET resolved=true,version=version+1 WHERE seller_id=$1 AND id=$2',[w.seller,id]);
  await activity(c,w.seller,'review_resolved',id,version+1,'seller',`${reason}: ${result}`,r.source_id);return result;
 });
}
export async function manualPromote(w:Workspace,id:string,version:number,reason:string) {
 text(reason,1000);return tx(w.p,async c=>{
  const ref=await w.get('claims',id);await lockItem(c,w.seller,ref.item_id);
  const r=(await c.query('SELECT * FROM trading.claims WHERE seller_id=$1 AND id=$2 FOR UPDATE',[w.seller,id])).rows[0];
  if(r.version!==integer(version,1)||r.state!=='backup')throw Error('stale-backup');
  const result=await promote(c,w.seller,r.item_id,id);if(!result)throw Error('unavailable-for-promotion');
  await activity(c,w.seller,'backup_promoted',id,r.version+1,'seller',reason);return result;
 });
}
export async function cancel(w:Workspace,id:string,version:number,reason:string) {
 text(reason,1000);integer(version,1);return tx(w.p,c=>release(c,w.seller,id,'cancelled',version,reason));
}
