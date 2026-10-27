import { quantity } from './values.js';
import type { Client } from './db.js';
import type { Envelope } from './intake.js';
export type Intent={kind:'claim'|'backup';quantity:number}|{kind:'review'}|{kind:'inquiry'};
export function intent(raw:string):Intent {
 const m=/^(claim|backup)(?: ([1-9]\d*))?$/i.exec(raw.trim());
 if(m){try{return {kind:m[1]!.toLowerCase() as 'claim'|'backup',quantity:quantity(m[2]??'1')};}catch{return {kind:'review'};}}
 return {kind:/\b(claim|backup)\b/i.test(raw)?'review':'inquiry'};
}
export async function classify(c:Client,s:string,ev:Envelope):Promise<Intent> {
 const parsed=intent(ev.text);
 if(parsed.kind==='inquiry') return parsed;
 if(!ev.item||!ev.actor||!ev.position) return {kind:'review'};
 if((await c.query("SELECT 1 FROM trading.orders WHERE seller_id=$1 AND item_id=$2 AND buyer=$3 AND state IN ('awaiting_payment','paid')",[s,ev.item,ev.actor])).rowCount) return {kind:'review'};
 return parsed;
}
