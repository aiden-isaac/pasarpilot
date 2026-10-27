import type pg from 'pg';
import { text } from './values.js';
export const tables=['inventory','listings','items','claims','orders','reservations','conversations','messages','drafts','reviews','activity'] as const;
export type Table=typeof tables[number];
export class Workspace {
 constructor(readonly p:pg.Pool,readonly seller:string) { text(seller); }
 async rows(table:Table) {
  if(!tables.includes(table)) throw Error('invalid-table');
  return (await this.p.query(`SELECT * FROM trading.${table} WHERE seller_id=$1 ORDER BY id LIMIT 200`,[this.seller])).rows;
 }
 async get(table:Table,id:string) {
  if(!tables.includes(table)) throw Error('invalid-table');
  const row=(await this.p.query(`SELECT * FROM trading.${table} WHERE seller_id=$1 AND id=$2`,[this.seller,text(id)])).rows[0];
  if(!row) throw Error('not-found'); return row;
 }
}
