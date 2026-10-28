import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accounts,id,payable } from '../database/helpers.js';
import { pool } from '../../../src/trading/db.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { hashPassword } from '../../../src/trading/password.js';
import { randomBytes } from 'node:crypto';
import { login } from '../../../src/trading/auth.js';
import { listen } from '../../../src/trading/server.js';
import { mutate,view } from '../../../src/trading/dashboard.js';
import { inventory } from '../../../src/trading/catalog.js';
import { listing,item } from '../../../src/trading/catalog.js';
import { allocate } from '../../../src/trading/stock.js';
import { tx } from '../../../src/trading/db.js';
import { timeline } from '../../../src/trading/history.js';
import { instructions } from '../../../src/trading/payments.js';
import { logout } from '../../../src/trading/auth.js';
test('authenticated HTTP boundary rejects foreign IDs forged origin CSRF and stale edits; colliding IDs and HTML stay isolated',async()=>{
 const [a,b]=await accounts(),p=pool(),wa=new Workspace(p,a.seller_id),wb=new Workspace(p,b.seller_id),password=randomBytes(24).toString('hex');
 await p.query('DELETE FROM trading.login_limits');await p.query('UPDATE trading.sellers SET password_hash=$2 WHERE id=$1',[a.seller_id,await hashPassword(password)]);
 const s=await login(p,a.tenant,password),app=await listen(p,0,mutate,view),addr=app.address();assert.ok(addr&&typeof addr!=='string');const base=`http://127.0.0.1:${addr.port}`;
 const post=(path:string,data:Record<string,string>,origin=base)=>fetch(base+path,{method:'POST',redirect:'manual',headers:{cookie:`session=${s.token}`,origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:s.csrf,...data})});
 try{
 for(const asset of ['workspace.css','workspace.js']){
  const response=await fetch(base+'/assets/'+asset);assert.equal(response.status,200);assert.match(response.headers.get('content-type')!,asset.endsWith('css')?/text\/css/:/text\/javascript/);
  const csp=response.headers.get('content-security-policy')!;assert.ok(csp.includes("default-src 'none'"));assert.ok(!csp.includes('unsafe-inline'));assert.ok(!csp.includes('https:'));
 }
 const key=id(),card={name:'<script>syntheticUnsafe()</script>',printing:'SYN',collector:'1',language:'English',finish:'nonfoil',condition:'NM',unsold:1,price:1000};await inventory(wa,card,key);await inventory(wb,{...card,name:'PRIVATE-SELLER-B'},key);
 const failed=await post('/inventory',{...card,name:'Keep <value>',unsold:'-1',price:'10.00',return:'/?view=inventory',password:'DO-NOT-RETAIN'} as unknown as Record<string,string>),failedHtml=await failed.text();
 assert.equal(failed.status,409);assert.match(failedHtml,/Unsold quantity needs correction/);assert.match(failedHtml,/value="Keep &lt;value&gt;"/);assert.match(failedHtml,/aria-invalid="true"/);assert.ok(!failedHtml.includes('DO-NOT-RETAIN'));assert.ok(!failedHtml.includes('invalid-stock'));
 const html=await (await fetch(base+'/?view=inventory&id='+key,{headers:{cookie:`session=${s.token}`}})).text();assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>syntheticUnsafe'));assert.ok(!html.includes('PRIVATE-SELLER-B'));
 const order=await payable(wb);assert.equal((await post('/cancel',{id:order.order,version:'2',reason:'forged',seller_id:b.seller_id})).status,409);assert.equal((await wb.get('orders',order.order)).state,'awaiting_payment');
 for(const [view,id] of [['orders',order.order],['inventory',order.inv],['listings',order.post],['items',order.item],['conversations',order.conv]]){
  const response=await fetch(base+'/?'+new URLSearchParams({view:view!,id:id!}),{headers:{cookie:`session=${s.token}`}});assert.equal(response.status,409);assert.ok(!(await response.text()).includes('PRIVATE-SELLER-B'));
 }
 const filtered=await fetch(base+'/?view=orders&state=paid&buyer=buyer-a',{headers:{cookie:`session=${s.token}`}});assert.equal(filtered.status,200);assert.match(await filtered.text(),/aria-current="page"/);
 const draft=(await p.query('SELECT id FROM trading.drafts WHERE seller_id=$1 AND order_id=$2',[wb.seller,order.order])).rows[0];assert.equal((await post('/approve',{id:draft.id,version:'1'})).status,409);
 assert.equal((await fetch(base+'/?order='+order.order,{headers:{cookie:`session=${s.token}`}})).status,409);
 assert.equal((await post('/listing',{title:'forged',csrf:'invalid'})).status,403);assert.equal((await post('/listing',{title:'forged'},'https://foreign.invalid')).status,403);
 assert.equal((await post('/inventory',{id:key,version:'999',...card,unsold:'0',price:'10.00'} as unknown as Record<string,string>)).status,409);assert.equal((await wa.get('inventory',key)).unsold,1);
 assert.equal((await fetch(base,{headers:{cookie:`session=${randomBytes(32).toString('hex')}`}})).status,401);
 }finally{app.closeAllConnections();await new Promise<void>(r=>app.close(()=>r()));await p.end();}
});

test('all seller form boundaries and new colliding detail demo cursor and update routes preserve isolation',async()=>{
 const [a,b]=await accounts(),p=pool(),wa=new Workspace(p,a.seller_id),wb=new Workspace(p,b.seller_id),passwords=[randomBytes(24).toString('hex'),randomBytes(24).toString('hex')];
 await p.query('DELETE FROM trading.login_limits');for(const [n,s]of[a,b].entries())await p.query('UPDATE trading.sellers SET password_hash=$2 WHERE id=$1',[s.seller_id,await hashPassword(passwords[n]!)]);
 const auth=[await login(p,a.tenant,passwords[0]!),await login(p,b.tenant,passwords[1]!)],app=await listen(p,0,mutate,view),addr=app.address();assert.ok(addr&&typeof addr!=='string');const base=`http://127.0.0.1:${addr.port}`;
 const get=(path:string,n=0)=>fetch(base+path,{headers:{cookie:`session=${auth[n]!.token}`}}),post=(path:string,data:Record<string,string>,n=0,origin=base,authenticated=true)=>fetch(base+path,{method:'POST',redirect:'manual',headers:{...(authenticated?{cookie:`session=${auth[n]!.token}`} :{}),origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:auth[n]!.csrf,...data})});
 const keys={inventory:id(),listing:id(),item:id(),conversation:id(),order:id(),review:id()},foreign='FOREIGN-PRIVATE-'+id(),own='Owned <img src=x onerror=syntheticUnsafe()>',original=console.error;let logs='';console.error=(...args)=>{logs=(logs+args.map(String).join(' ')).slice(-8192);};
 try{
  for(const [n,w]of[wa,wb].entries()){
   await inventory(w,{name:n?foreign:own,printing:'SYN',collector:'1',language:'English',finish:'nonfoil',condition:'NM',unsold:1,price:1000},keys.inventory);await listing(w,n?foreign:'Owned synthetic listing',keys.listing);await item(w,keys.listing,keys.inventory,1,keys.item);
   await p.query('INSERT INTO trading.conversations(seller_id,id,buyer,thread,item_id) VALUES($1,$2,\'buyer-a\',$2,$3)',[w.seller,keys.conversation,keys.item]);await tx(p,c=>allocate(c,w.seller,{id:keys.order,item:keys.item,buyer:'buyer-a',conversation:keys.conversation,quantity:1,position:1,kind:'claim'}));
   await p.query('INSERT INTO trading.reviews(seller_id,id,order_id,reason) VALUES($1,$2,$3,$4)',[w.seller,keys.review,keys.order,n?foreign:'Owned synthetic review']);
   for(let count=0;count<2;count++)await p.query("INSERT INTO trading.messages(seller_id,id,conversation_id,text,direction) VALUES($1,$2,$3,$4,'in')",[w.seller,id(),keys.conversation,n?foreign:own]);
  }
  const v=(await p.query('SELECT instruction_version FROM trading.sellers WHERE id=$1',[wb.seller])).rows[0].instruction_version;await instructions(wb,v,foreign,false);
  for(const [section,key]of[['inventory',keys.inventory],['listings',keys.listing],['items',keys.item],['conversations',keys.conversation],['orders',keys.order],['reviews',keys.review]]){const response=await get('/?'+new URLSearchParams({view:section!,id:key!})),html=await response.text();assert.equal(response.status,200);assert.ok(!html.includes(foreign));assert.ok(!html.includes('<img src=x'));}
  const cardHtml=await(await get('/?view=inventory&id='+keys.inventory)).text();assert.match(cardHtml,/Owned &lt;img/);
  const count=async()=>(await p.query('SELECT count(*)::int n FROM trading.activity WHERE seller_id=ANY($1::text[])',[[wa.seller,wb.seller]])).rows[0].n,before=await count();
  for(const confirm of ['cancel','complete','payment']){assert.equal((await get('/?'+new URLSearchParams({view:'orders',id:keys.order,confirm}))).status,200);}assert.equal(await count(),before);
  for(const route of ['/profile','/demo-start','/demo-step','/inventory','/listing','/item','/policy','/instructions','/confirm-payment','/arrange','/fulfil','/complete','/terms','/payment-draft','/regenerate','/approve','/cancel','/extend','/promote','/review','/synthetic','/logout']){
   assert.equal((await post(route,{csrf:'forged'})).status,403,route+' CSRF');assert.equal((await post(route,{},0,'https://foreign.invalid')).status,403,route+' origin');assert.equal((await post(route,{},0,base,false)).status,401,route+' authentication');
  }assert.equal(await count(),before);
  const pages=[await wb.select('inventory','',{limit:1}),await wb.page('orders',{limit:1}),await wb.children('conversations',keys.conversation,'messages',{limit:1}),await timeline(wb,keys.order,{limit:1})];for(const page of pages)assert.ok(page.next);
  const queries:Record<string,string>[]=[{view:'inventory',cursor:pages[0]!.next!},{view:'orders',cursor:pages[1]!.next!},{view:'conversations',id:keys.conversation,child:'messages',childCursor:pages[2]!.next!},{view:'orders',id:keys.order,child:'activity',childCursor:pages[3]!.next!}];
  for(const params of queries){const response=await get('/?'+new URLSearchParams({...params,limit:'1'}));assert.equal(response.status,409);assert.ok(!(await response.text()).includes(foreign));}
  const run=id();for(const n of[0,1])assert.equal((await post('/demo-start',{run},n)).status,303);assert.equal((await p.query('SELECT count(*)::int n FROM trading.items WHERE id=$1',['demo-item:'+run])).rows[0].n,2);
  assert.equal((await post('/demo-step',{run,step:'claim-a'})).status,303);assert.equal((await p.query('SELECT count(*)::int n FROM trading.orders WHERE seller_id=$1 AND item_id=$2',[wb.seller,'demo-item:'+run])).rows[0].n,0);assert.ok(!(await(await get('/?view=demo&id='+run)).text()).includes(foreign));
  assert.equal((await post('/profile',{version:'2147483647',display_name:'stale profile'})).status,409);
  const secret='UNSAVED-PRIVATE-'+id(),failure=await post('/instructions',{version:'2147483647',instructions:secret,approved:'yes',return:'/?view=settings'});assert.equal(failure.status,409);assert.ok(!(await failure.text()).includes(secret));assert.ok(!logs.includes(secret)&&!logs.includes(foreign)&&!logs.includes(auth[0]!.token));
  await logout(p,auth[0]!.token);assert.equal((await get('/updates')).status,401);for(const path of ['/?view=settings','/?view=demo','/?view=orders&id='+keys.order])assert.equal((await get(path)).status,401);assert.equal((await post('/demo-step',{run,step:'backup-b'})).status,401);
 }finally{console.error=original;app.closeAllConnections();await new Promise<void>(r=>app.close(()=>r()));await p.end();}
});
