import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { tx } from './db.js';
import { hashPassword } from './password.js';
export async function seed(p: pg.Pool, passwords: string[]) {
 if(passwords.length!==2) throw Error('two-passwords-required-on-stdin');
 const hashes=await Promise.all(passwords.map(hashPassword));
 return tx(p,async c=>{
  if((await c.query('SELECT 1 FROM trading.sellers LIMIT 1')).rowCount) throw Error('fresh-dataset-required');
  const ids=[randomUUID(),randomUUID()];
  for(let i=0;i<2;i++) {
   const tenant=['seller-a','seller-b'][i]!;
   await c.query('INSERT INTO trading.sellers(id,login,password_hash) VALUES($1,$2,$3)',[ids[i],tenant,hashes[i]]);
   await c.query('INSERT INTO trading.sources(tenant,seller_id,source,epoch) VALUES($1,$2,\'synthetic\',$3)',[tenant,ids[i],randomUUID()]);
   for(const actor of ['buyer-a','buyer-b']) await c.query('INSERT INTO trading.actors VALUES($1,$2)',[ids[i],actor]);
  }
  return ids;
 });
}
