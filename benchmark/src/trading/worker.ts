import type pg from 'pg';
import { queue } from './db.js';
import { processStream } from './consumer.js';
import { handle,sweep } from './stock.js';
import { importHandoffs } from './capture.js';
import { Workspace } from './workspace.js';
export async function worker(p:pg.Pool) {
 const boss=queue(p);await boss.start();let busy=false;
 const tick=async()=>{if(busy)return;busy=true;try{
  if(process.env.TRADING_CAPTURE_ROOT){try{await importHandoffs(p,boss,process.env.TRADING_CAPTURE_ROOT);}catch{console.error('trading-capture-unavailable');}}
  const sources=(await p.query('SELECT * FROM trading.sources ORDER BY tenant')).rows;
  for(const s of sources){
   try{await sweep(new Workspace(p,s.seller_id));}catch{console.error('trading-expiry-retry');}
   try{await processStream(p,s.seller_id,s.source,s.epoch,handle);}catch{console.error('trading-source-retry');}
  }
  for(const name of ['inbox','expiry']) {const jobs=await boss.fetch(name,{batchSize:100});for(const j of jobs) await boss.complete(name,j.id);}
  await boss.maintain();
 }catch{console.error('trading-worker-retry');}finally{busy=false;}};
 await tick();const timer=setInterval(()=>void tick(),5000);
 return async()=>{clearInterval(timer);while(busy)await new Promise(r=>setTimeout(r,20));await boss.stop();};
}
