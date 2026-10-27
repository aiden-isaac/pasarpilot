import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accounts,id } from './helpers.js';
import { pool,queue } from '../../../src/trading/db.js';
import { intake,synthetic } from '../../../src/trading/intake.js';
import { processStream } from '../../../src/trading/consumer.js';
test('durable stream cursor defers gaps and missing parents and reviews acted-on revisions',async()=>{
 const [a]=await accounts(),p=pool(),b=queue(p);await b.start();try{
 const cursor=(await p.query('SELECT cursor FROM trading.streams WHERE seller_id=$1 AND source=$2 AND epoch=$3',[a.seller_id,a.source,a.epoch])).rows[0]?.cursor??0;
 const one={...synthetic({source:a.source,epoch:a.epoch},cursor+1,id()),item:null,parent:null};
 const two={...one,event:id(),object:id(),position:cursor+2};await intake(p,b,a.tenant,two);const seen:number[]=[];
 const work=()=>processStream(p,a.seller_id,a.source,a.epoch,async(_c,_s,_id,e)=>{seen.push(e.position!);return 'observed';});
 await work();assert.deepEqual(seen,[]);await intake(p,b,a.tenant,one);await work();assert.deepEqual(seen,[cursor+1,cursor+2]);await work();assert.equal(seen.length,2);
 await intake(p,b,a.tenant,{...one,revision:2,position:cursor+3,text:'claim 2'});await work();assert.equal(seen.length,2);
 assert.ok((await p.query("SELECT 1 FROM trading.reviews WHERE seller_id=$1 AND reason LIKE 'source edited%'",[a.seller_id])).rowCount);
 }finally{await b.stop();await p.end();}
});
