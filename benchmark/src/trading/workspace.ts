import type pg from 'pg';
import { text } from './values.js';
import { readPage,type PageInput } from './paging.js';
export const tables=['inventory','listings','items','claims','orders','reservations','conversations','messages','drafts','reviews','activity'] as const;
export type Table=typeof tables[number];
export class Workspace {
 constructor(readonly p:pg.Pool,readonly seller:string) { text(seller); }
 async page(table:Table,input:PageInput & {state?:string;buyer?:string;open?:string;resolved?:string}={}) {
  if(!tables.includes(table)) throw Error('invalid-table');
  const {state='',buyer='',open='',resolved=''}=input;
  const states:Partial<Record<Table,string[]>>={orders:['awaiting_payment','paid','completed','cancelled','expired'],claims:['primary','backup','review','withdrawn','fulfilled','unfulfilled','expired'],reservations:['held','released','expired','committed'],drafts:['proposed','stale','delivered']};
  if(state&&!states[table]?.includes(state))throw Error('invalid-state-filter');
  if(buyer){if(!['orders','claims','conversations'].includes(table))throw Error('invalid-buyer-filter');text(buyer);}
  if(open&&(!['listings','items'].includes(table)||!['true','false'].includes(open)))throw Error('invalid-open-filter');
  if(resolved&&(table!=='reviews'||!['true','false'].includes(resolved)))throw Error('invalid-review-filter');
  const args:unknown[]=[this.seller];let where='seller_id=$1';
  for(const [column,value] of [['state',state],['buyer',buyer],['open',open],['resolved',resolved]])if(value){args.push(value);where+=` AND ${column}=$${args.length}`;}
  return readPage(this.p,`SELECT * FROM trading.${table} WHERE ${where}`,args,JSON.stringify([this.seller,table,state,buyer,open,resolved]),input,['orders','messages'].includes(table)?'time':table==='activity'?'activity':'id');
 }
 async get(table:Table,id:string) {
  if(!tables.includes(table)) throw Error('invalid-table');
  const row=(await this.p.query(`SELECT * FROM trading.${table} WHERE seller_id=$1 AND id=$2`,[this.seller,text(id)])).rows[0];
  if(!row) throw Error('not-found'); return row;
 }
 async children(parent:'listings'|'items'|'orders'|'conversations',id:string,table:Table,input:PageInput={}) {
  if(!['listings','items','orders','conversations'].includes(parent)||!tables.includes(table))throw Error('invalid-detail-relation');
  const relations={listings:{items:'listing_id'},items:{claims:'item_id',orders:'item_id',conversations:'item_id',drafts:'item_id'},
   orders:{drafts:'order_id',reviews:'order_id'},conversations:{messages:'conversation_id',drafts:'conversation_id',orders:'conversation_id'}};
  const column=(relations[parent] as Record<string,string>|undefined)?.[table];
  if(!column)throw Error('invalid-detail-relation');
  await this.get(parent,id);
  const ranks=table==='claims'?`,count(*) FILTER(WHERE state='backup') OVER(ORDER BY position,id) AS backup_rank`:'';
  return readPage(this.p,`SELECT r.*${ranks} FROM trading.${table} r WHERE seller_id=$1 AND ${column}=$2`,[this.seller,id],JSON.stringify([this.seller,parent,id,table]),input,table==='claims'?'position':table==='messages'||table==='orders'?'time':'id');
 }
}
