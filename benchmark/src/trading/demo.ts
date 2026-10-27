import { inventory,listing,item } from './catalog.js';
import { Workspace,type Table } from './workspace.js';
import { generate } from './intake.js';
import { queue } from './db.js';
import { processStream } from './consumer.js';
import { handle } from './stock.js';
export function demoIds(run:string){
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(run))throw Error('invalid-demo-run');
 return {inventory:'demo-inventory:'+run,listing:'demo-listing:'+run,item:'demo-item:'+run};
}
export async function startDemo(w:Workspace,run:string){
 const ids=demoIds(run);
 const ensure=async(table:Table,id:string,create:()=>Promise<string>)=>{
  if((await w.p.query(`SELECT 1 FROM trading.${table} WHERE seller_id=$1 AND id=$2`,[w.seller,id])).rowCount)return;
  try{await create();}catch(error){
   if(!error||typeof error!=='object'||!('code'in error)||error.code!=='23505'||!('constraint'in error)||error.constraint!==table+'_pkey')throw error;
   await w.get(table,id);
  }
 };
 // Each existing catalog transaction is durable; retry resumes a partially created run.
 await ensure('inventory',ids.inventory,()=>inventory(w,{name:'RM10 demonstration '+run.slice(0,8),printing:'SYN',collector:'1',language:'English',finish:'nonfoil',condition:'NM',unsold:1,price:1000},ids.inventory));
 await ensure('listings',ids.listing,()=>listing(w,'Synthetic RM10 WTS '+run.slice(0,8),ids.listing));
 await ensure('items',ids.item,()=>item(w,ids.listing,ids.inventory,1,ids.item));
 const mapped=await w.get('items',ids.item);if(mapped.inventory_id!==ids.inventory||mapped.listing_id!==ids.listing)throw Error('invalid-demo-association');
 return ids;
}
export async function demoStep(w:Workspace,run:string,step:string){
 const ids=demoIds(run);if(!['claim-a','backup-b'].includes(step))throw Error('invalid-demo-step');
 const mapped=await w.get('items',ids.item),card=await w.get('inventory',mapped.inventory_id),event='demo:'+run+':'+step;
 const source=(await w.p.query('SELECT * FROM trading.sources WHERE seller_id=$1',[w.seller])).rows[0];
 const replay=(await w.p.query('SELECT 1 FROM trading.inbox WHERE seller_id=$1 AND source=$2 AND epoch=$3 AND event_id=$4 AND revision=1',[w.seller,source.source,source.epoch,event])).rowCount;
 if(!replay){
  if(mapped.price!==1000||mapped.offered!==1||card.price!==1000||card.finish!=='nonfoil'||card.condition!=='NM')throw Error('invalid-demo-variant-or-price');
  if(step==='backup-b'&&!(await w.p.query("SELECT 1 FROM trading.orders o JOIN trading.reservations r USING(seller_id,id) WHERE o.seller_id=$1 AND o.item_id=$2 AND o.buyer='buyer-a' AND o.state='awaiting_payment' AND r.state='held' AND r.expires_at>clock_timestamp()",[w.seller,ids.item])).rowCount)throw Error('review-demo-needs-live-buyer-a-hold');
 }
 await generate(w.p,queue(w.p),source.tenant,{event,item:ids.item,actor:step==='claim-a'?'buyer-a':'buyer-b',message:'claim',kind:'reply'});
 await processStream(w.p,w.seller,source.source,source.epoch,handle);
}
