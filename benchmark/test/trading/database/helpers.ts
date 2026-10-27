import { randomBytes, randomUUID } from 'node:crypto';
import { pool } from '../../../src/trading/db.js';
import { migrate } from '../../../src/trading/migrate.js';
import { seed } from '../../../src/trading/setup.js';
export const id = () => randomUUID();
export async function accounts() {
 const admin=pool('fixture'); await migrate(admin);
 if(!(await admin.query('SELECT 1 FROM trading.sellers')).rowCount) await seed(admin,[randomBytes(24).toString('hex'),randomBytes(24).toString('hex')]);
 const rows=(await admin.query('SELECT * FROM trading.sources ORDER BY tenant')).rows;
 await admin.end(); return rows;
}
import { Workspace } from '../../../src/trading/workspace.js';
import { inventory,listing,item } from '../../../src/trading/catalog.js';
export async function trade(w:Workspace,stock=1) {
 const inv=await inventory(w,{name:'Synthetic Bolt',printing:'SYN',collector:'1',language:'English',finish:'nonfoil',condition:'NM',unsold:stock,price:1000});
 const post=await listing(w,'Synthetic WTS'),it=await item(w,post,inv,stock);
 const conv=id(),convB=id();
 for(const [key,buyer] of [[conv,'buyer-a'],[convB,'buyer-b']]) await w.p.query('INSERT INTO trading.conversations(seller_id,id,buyer,thread,item_id) VALUES($1,$2,$3,$2,$4)',[w.seller,key,buyer,it]);
 return {inv,post,item:it,conv,convB};
}
import { allocate } from '../../../src/trading/stock.js';
import { tx } from '../../../src/trading/db.js';
import { instructions,terms,paymentDraft } from '../../../src/trading/payments.js';
import { approve } from '../../../src/trading/proposals.js';
export async function payable(w:Workspace) {
 const t=await trade(w),order=id();await tx(w.p,c=>allocate(c,w.seller,{id:order,item:t.item,buyer:'buyer-a',conversation:t.conv,quantity:1,position:1,kind:'claim'}));
 const v=(await w.p.query('SELECT instruction_version FROM trading.sellers WHERE id=$1',[w.seller])).rows[0].instruction_version;
 await instructions(w,v,'DEMO ONLY synthetic payment account',true);await terms(w,order,1,'collection',0);await approve(w,await paymentDraft(w,order,2),1);
 return {...t,order,version:2};
}
