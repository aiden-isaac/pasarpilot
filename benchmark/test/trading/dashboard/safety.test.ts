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
