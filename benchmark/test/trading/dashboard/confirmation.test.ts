import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { accounts,id,payable } from '../database/helpers.js';
import { pool,tx } from '../../../src/trading/db.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { allocate } from '../../../src/trading/stock.js';
import { confirmPayment } from '../../../src/trading/payments.js';
import { arrange,fulfil } from '../../../src/trading/fulfilment.js';
import { login } from '../../../src/trading/auth.js';
import { hashPassword } from '../../../src/trading/password.js';
import { listen } from '../../../src/trading/server.js';
import { mutate,view } from '../../../src/trading/dashboard.js';

test('critical review GETs are read-only; explicit confirmation, two-session versions and replay protect stock',async()=>{
 const [a]=await accounts(),p=pool(),w=new Workspace(p,a.seller_id),password=randomBytes(24).toString('hex');
 await p.query('UPDATE trading.sellers SET password_hash=$2 WHERE id=$1',[w.seller,await hashPassword(password)]);await p.query('DELETE FROM trading.login_limits');
 const first=await login(p,a.tenant,password),second=await login(p,a.tenant,password),app=await listen(p,0,mutate,view),addr=app.address();assert.ok(addr&&typeof addr!=='string');const base=`http://127.0.0.1:${addr.port}`;
 const post=(path:string,data:Record<string,string>,auth=first)=>fetch(base+path,{method:'POST',redirect:'manual',headers:{cookie:`session=${auth.token}`,origin:base,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:auth.csrf,...data})});
 const get=(id:string,confirm='')=>fetch(base+'/?'+new URLSearchParams({view:'orders',id,...(confirm?{confirm}:{})}),{headers:{cookie:`session=${first.token}`}});
 try{
  const t=await payable(w),backup=id();await tx(p,c=>allocate(c,w.seller,{id:backup,item:t.item,buyer:'buyer-b',conversation:t.convB,quantity:1,position:2,kind:'claim'}));
  const count=async()=>(await p.query('SELECT count(*)::int n FROM trading.activity WHERE seller_id=$1',[w.seller])).rows[0].n;
  const before=await count();const review=await get(t.order,'cancel');assert.equal(review.status,200);assert.match(await review.text(),/may promote the earliest eligible backup/);await get(t.order);assert.equal(await count(),before);
  assert.equal((await post('/cancel',{id:t.order,version:'2',reason:'Synthetic cancellation'})).status,409);assert.equal((await w.get('orders',t.order)).state,'awaiting_payment');
  assert.equal((await post('/arrange',{id:t.order,version:'2',location:'Synthetic shop',time:new Date().toISOString()},second)).status,303);
  assert.equal((await post('/cancel',{id:t.order,version:'2',reason:'Synthetic cancellation',confirmed:'yes'})).status,409);
  assert.equal((await post('/cancel',{id:t.order,version:'3',reason:'Synthetic cancellation',confirmed:'yes'})).status,303);
  assert.equal((await w.get('orders',backup)).state,'awaiting_payment');assert.equal((await w.get('inventory',t.inv)).reserved,1);
  const after=await count();await post('/cancel',{id:t.order,version:'3',reason:'Replay',confirmed:'yes'});assert.equal(await count(),after);
  const done=await payable(w);await confirmPayment(w,done.order,2,1000,true);await arrange(w,done.order,3,{location:'Synthetic shop',time:new Date().toISOString()});await fulfil(w,done.order,4,'collected','Synthetic handover');
  const beforeReview=await count();assert.equal((await get(done.order,'complete')).status,200);assert.equal(await count(),beforeReview);
  assert.equal((await post('/complete',{id:done.order,version:'5'})).status,409);
  assert.equal((await post('/complete',{id:done.order,version:'5',confirmed:'yes'})).status,303);
  const completed=await count();await post('/complete',{id:done.order,version:'5',confirmed:'yes'});assert.equal(await count(),completed);assert.equal((await w.get('inventory',done.inv)).unsold,0);
 }finally{app.closeAllConnections();await new Promise<void>(r=>app.close(()=>r()));await p.end();}
});
