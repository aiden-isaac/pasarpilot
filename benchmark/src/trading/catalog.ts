import { randomUUID } from 'node:crypto';
import { tx,activity } from './db.js';
import { Workspace } from './workspace.js';
import { integer,text } from './values.js';
export type Card={name:string;printing:string;collector:string;language:string;finish:string;condition:string;unsold:number;price:number};
export async function inventory(w:Workspace,card:Card,id:string=randomUUID(),version?:number) {
 const fields=[card.name,card.printing,card.collector,card.language,card.finish,card.condition].map(s=>text(s));
 if(!['nonfoil','foil','etched','other'].includes(card.finish)||!['NM','LP','MP','HP','DMG'].includes(card.condition)) throw Error('invalid-variant-or-condition');
 integer(card.unsold);integer(card.price);
 await tx(w.p,async c=>{
  const args=[w.seller,id,...fields,card.unsold,card.price];
  const r=version===undefined?await c.query('INSERT INTO trading.inventory(seller_id,id,name,printing,collector,language,finish,condition,unsold,price) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING version',args):
   await c.query('UPDATE trading.inventory SET name=$3,printing=$4,collector=$5,language=$6,finish=$7,condition=$8,unsold=$9,price=$10,version=version+1 WHERE seller_id=$1 AND id=$2 AND version=$11 AND reserved<=$9 RETURNING version',[...args,integer(version,1)]);
  if(!r.rowCount) throw Error('stale-or-held-stock-conflict');
  await activity(c,w.seller,'inventory_saved',id,r.rows[0].version);
 });return id;
}
