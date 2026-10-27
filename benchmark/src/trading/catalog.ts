import { randomUUID } from 'node:crypto';
import { reconcileInventory } from './stock.js';
import { tx,activity } from './db.js';
import { Workspace } from './workspace.js';
import { integer,text } from './values.js';
export type Card={name:string;printing:string;collector:string;language:string;finish:string;condition:string;unsold:number;price:number};
export async function inventory(w:Workspace,card:Card,id:string=randomUUID(),version?:number) {
 const fields=[card.name,card.printing,card.collector,card.language,card.finish,card.condition].map(s=>text(s));
 if(!['nonfoil','foil','etched','other'].includes(card.finish)||!['NM','LP','MP','HP','DMG'].includes(card.condition)) throw Error('invalid-variant-or-condition');
 integer(card.unsold);integer(card.price);
 await tx(w.p,async c=>{
  if(version!==undefined){await c.query('SELECT id FROM trading.inventory WHERE seller_id=$1 AND id=$2 FOR UPDATE',[w.seller,id]);await reconcileInventory(c,w.seller,id);}
  const args=[w.seller,id,...fields,card.unsold,card.price];
  const r=version===undefined?await c.query('INSERT INTO trading.inventory(seller_id,id,name,printing,collector,language,finish,condition,unsold,price) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING version',args):
   await c.query('UPDATE trading.inventory SET name=$3,printing=$4,collector=$5,language=$6,finish=$7,condition=$8,unsold=$9,price=$10,version=version+1 WHERE seller_id=$1 AND id=$2 AND version=$11 AND reserved<=$9 RETURNING version',[...args,integer(version,1)]);
  if(!r.rowCount) throw Error('stale-or-held-stock-conflict');
  await activity(c,w.seller,'inventory_saved',id,r.rows[0].version);
 });return id;
}
export async function listing(w:Workspace,title:string,id:string=randomUUID(),version?:number,open=true) {
 await tx(w.p,async c=>{
  const r=version===undefined?await c.query('INSERT INTO trading.listings(seller_id,id,title) VALUES($1,$2,$3) RETURNING version',[w.seller,id,text(title)]):
   await c.query('UPDATE trading.listings SET title=$3,open=$4,version=version+1 WHERE seller_id=$1 AND id=$2 AND version=$5 RETURNING version',[w.seller,id,text(title),open,integer(version,1)]);
  if(!r.rowCount) throw Error('stale-or-not-found'); await activity(c,w.seller,'listing_saved',id,r.rows[0].version);
 });return id;
}
export async function item(w:Workspace,listingId:string,inventoryId:string,offered:number,id:string=randomUUID(),version?:number,open=true) {
 integer(offered,1);
 await tx(w.p,async c=>{
  const inv=(await c.query('SELECT * FROM trading.inventory WHERE seller_id=$1 AND id=$2 FOR UPDATE',[w.seller,inventoryId])).rows[0];
  if(inv)await reconcileInventory(c,w.seller,inventoryId);
  const parent=(await c.query('SELECT * FROM trading.listings WHERE seller_id=$1 AND id=$2 FOR UPDATE',[w.seller,listingId])).rows[0];
  if(!inv||!parent) throw Error('not-found');
  const r=version===undefined?await c.query('INSERT INTO trading.items(seller_id,id,listing_id,inventory_id,offered,price) VALUES($1,$2,$3,$4,$5,$6) RETURNING version',[w.seller,id,listingId,inventoryId,offered,inv.price]):
   await c.query('UPDATE trading.items SET offered=$3,open=$4,version=version+1 WHERE seller_id=$1 AND id=$2 AND version=$5 AND inventory_id=$6 AND listing_id=$7 AND allocated<=$3 RETURNING version',[w.seller,id,offered,open,integer(version,1),inventoryId,listingId]);
  if(!r.rowCount) throw Error('stale-or-held-listing-conflict'); await activity(c,w.seller,'item_saved',id,r.rows[0].version);
 });return id;
}
