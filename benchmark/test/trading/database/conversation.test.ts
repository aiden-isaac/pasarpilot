import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accounts,id } from './helpers.js';
import { pool,tx } from '../../../src/trading/db.js';
import { synthetic,intake } from '../../../src/trading/intake.js';
import { queue } from '../../../src/trading/db.js';
import { conversation } from '../../../src/trading/conversation.js';
test('stable actors preserve unrelated messages as unassociated review with no stock or payment effects',async()=>{
 const [a]=await accounts(),p=pool(),b=queue(p);await b.start();try{
 const ev={...synthetic({source:a.source,epoch:a.epoch},null as unknown as number,id(),'buyer-a','Unrelated synthetic text'),item:null,parent:null,thread:id()};const r=await intake(p,b,a.tenant,ev);
 const before=(await p.query('SELECT count(*) FROM trading.orders WHERE seller_id=$1',[a.seller_id])).rows[0].count;
 const conv=await tx(p,c=>conversation(c,a.seller_id,r.id,ev));assert.equal(conv.item_id,null);assert.equal(conv.buyer,'buyer-a');
 assert.equal((await p.query('SELECT count(*) FROM trading.orders WHERE seller_id=$1',[a.seller_id])).rows[0].count,before);
 assert.equal((await p.query('SELECT text FROM trading.messages WHERE seller_id=$1 AND id=$2',[a.seller_id,r.id])).rows[0].text,ev.text);
 }finally{await b.stop();await p.end();}
});
