import assert from 'node:assert/strict';
import type pg from 'pg';
import type { Account,Evidence,httpClient } from './operations.js';
import type { Page } from './paging.js';
import { Workspace } from './workspace.js';
import { timeline } from './history.js';
import { inventory,listing,item,type Card } from './catalog.js';
import { generate } from './intake.js';
import { processStream } from './consumer.js';
import { handle } from './stock.js';
import { queue } from './db.js';
import { Latencies } from './operations-metrics.js';

export async function growthProbe(p:pg.Pool,accounts:Account[],clients:Awaited<ReturnType<typeof httpClient>>[],runs:string[],target:number,report:Evidence,guard:()=>string|undefined){
 const latency=new Latencies();
 for(let n=0;n<accounts.length;n++){
  const w=new Workspace(p,accounts[n]!.seller),run=runs[n]!,client=clients[n]!,prefix=`growth-${target}:${run}`;
  const expected=(await p.query('SELECT count(*)::int n FROM trading.orders WHERE seller_id=$1',[w.seller])).rows[0].n;assert.equal(expected,target);
  const card:Card={name:prefix,printing:'SYN',collector:'growth',language:'English',finish:'nonfoil',condition:'NM',unsold:1,price:1000};
  const stock=await inventory(w,card,prefix),post=await listing(w,prefix,prefix);
  for(let count=0;count<235;count++){if(guard())throw Error('growth-admission-stopped');await item(w,post,stock,1,prefix+':'+count);}
  const source=(await p.query('SELECT * FROM trading.sources WHERE seller_id=$1',[w.seller])).rows[0];
  for(let count=0;count<235;count++){
   if(guard())throw Error('growth-admission-stopped');await generate(p,queue(p),source.tenant,{event:prefix+':message:'+count,item:'demo-item:'+run,actor:'buyer-a',message:'Synthetic availability enquiry '+count,kind:'message'});
   if(count%25===24)await processStream(p,w.seller,source.source,source.epoch,handle);
  }
  await processStream(p,w.seller,source.source,source.epoch,handle);
  const order=(await p.query("SELECT id,conversation_id FROM trading.orders WHERE seller_id=$1 AND item_id=$2 AND buyer='buyer-a'",[w.seller,'demo-item:'+run])).rows[0];
  const walk=async(name:string,read:(cursor?:string)=>Promise<Page>,expectedRows:number)=>{
   let cursor:string|undefined,count=0,pages=0,last:pg.QueryResultRow|undefined;
   do{if(guard())throw Error('growth-admission-stopped');const start=performance.now(),page=await read(cursor);latency.add(performance.now()-start);assert.ok(page.rows.length<=100);assert.notEqual(page.next,cursor||'initial');count+=page.rows.length;pages++;last=page.rows.at(-1)??last;cursor=page.next;}while(cursor);
   assert.equal(count,expectedRows);report.write({type:'paged-probe',target,seller:w.seller,name,rows:count,pages,maxPageRows:100});return last;
  };
  await walk('all-orders',cursor=>w.page('orders',{limit:100,cursor}),target);
  await walk('completed-filter',cursor=>w.page('orders',{state:'completed',buyer:'buyer-a',limit:100,cursor}),target);
  await walk('related-items',cursor=>w.children('listings',post,'items',{limit:100,cursor}),235);
  const messages=(await p.query('SELECT count(*)::int n FROM trading.messages WHERE seller_id=$1 AND conversation_id=$2',[w.seller,order.conversation_id])).rows[0].n;assert.ok(messages>200);
  await walk('long-thread',cursor=>w.children('conversations',order.conversation_id,'messages',{limit:100,cursor}),messages);
  const inventoryCount=(await p.query('SELECT count(*)::int n FROM trading.inventory WHERE seller_id=$1',[w.seller])).rows[0].n,last=await walk('inventory-selector',cursor=>w.select('inventory','',{limit:100,cursor}),inventoryCount);assert.ok(last);
  const back='/?view=inventory&id='+encodeURIComponent(last.id);await client.get(back);await client.post('/inventory',{id:last.id,version:String(last.version),name:last.name,printing:last.printing,collector:last.collector,language:last.language,finish:last.finish,condition:last.condition,unsold:String(last.unsold),price:(last.price/100).toFixed(2),return:back});assert.equal((await w.get('inventory',last.id)).version,last.version+1);
  await client.post('/item',{listing_id:post,inventory_id:last.id,offered:'1'});assert.equal((await p.query('SELECT count(*)::int n FROM trading.items WHERE seller_id=$1 AND listing_id=$2',[w.seller,post])).rows[0].n,236);
  await client.get('/?view=listings&id='+encodeURIComponent(post));await client.get('/?view=conversations&id='+encodeURIComponent(order.conversation_id));await client.get('/?view=orders&id='+encodeURIComponent(order.id)+'&child=activity');await timeline(w,order.id);
  for(const path of ['/?view=orders','/?view=orders&state=completed&buyer=buyer-a','/?view=orders&id='+encodeURIComponent(order.id)+'&child=activity','/?view=conversations&id='+encodeURIComponent(order.conversation_id),'/updates']){const observed=new Latencies();for(let repeat=0;repeat<20;repeat++){if(guard())throw Error('growth-admission-stopped');const start=performance.now();await client.get(path);observed.add(performance.now()-start);}report.write({type:'growth-http-latency',target,seller:w.seller,path,...observed.snapshot()});assert.ok(observed.snapshot().p95Ms<=500);}
  const traced={query:async(sql:string,args:unknown[])=>{const result=await p.query(sql,args);if(sql.includes('page_source')){const plan=(await p.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+sql,args)).rows[0]['QUERY PLAN'][0];report.write({type:'query-plan',target,seller:w.seller,name:'actual-timeline-page',returnedRows:result.rows.length,plan});}return result;}} as unknown as pg.Pool;await timeline(new Workspace(traced,w.seller),order.id);
  for(const [name,sql,args] of [
   ['orders-page','SELECT * FROM trading.orders WHERE seller_id=$1 ORDER BY created_at DESC,id DESC LIMIT 101',[w.seller]],
   ['filtered-orders','SELECT * FROM trading.orders WHERE seller_id=$1 AND state=$2 AND buyer=$3 ORDER BY created_at DESC,id DESC LIMIT 101',[w.seller,'completed','buyer-a']],
   ['order-drafts','SELECT * FROM trading.drafts WHERE seller_id=$1 AND order_id=$2 ORDER BY id LIMIT 101',[w.seller,order.id]],
   ['long-messages','SELECT * FROM trading.messages WHERE seller_id=$1 AND conversation_id=$2 ORDER BY created_at DESC,id DESC LIMIT 101',[w.seller,order.conversation_id]],
   ['related-items','SELECT * FROM trading.items WHERE seller_id=$1 AND listing_id=$2 ORDER BY id LIMIT 101',[w.seller,post]],
  ] as const){const plan=(await p.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+sql,[...args])).rows[0]['QUERY PLAN'][0];report.write({type:'query-plan',target,seller:w.seller,name,plan});}
 }
 report.write({type:'growth-probe-latency',target,...latency.snapshot()});assert.ok(latency.snapshot().p95Ms<=500);
}
