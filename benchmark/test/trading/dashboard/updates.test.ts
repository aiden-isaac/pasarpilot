import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { accounts,id,payable } from '../database/helpers.js';
import { pool } from '../../../src/trading/db.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { login,logout } from '../../../src/trading/auth.js';
import { hashPassword } from '../../../src/trading/password.js';
import { listen } from '../../../src/trading/server.js';
import { mutate,view } from '../../../src/trading/dashboard.js';

test('read-only updates are bounded/private, session scoped and include late commits below the current identity maximum',async()=>{
 const [a,b]=await accounts(),p=pool(),password=randomBytes(24).toString('hex');
 await p.query('UPDATE trading.sellers SET password_hash=$2 WHERE id=$1',[a.seller_id,await hashPassword(password)]);await p.query('DELETE FROM trading.login_limits');const auth=await login(p,a.tenant,password);
 const app=await listen(p,0,mutate,view),addr=app.address();assert.ok(addr&&typeof addr!=='string');const base=`http://127.0.0.1:${addr.port}`,cookie=`session=${auth.token}`;
 const get=(query='')=>fetch(base+'/updates'+query,{headers:{cookie}});
 const slow=await p.connect();
 try{
  const t=await payable(new Workspace(p,a.seller_id)),foreign=id();
  await p.query("INSERT INTO trading.messages VALUES($1,$2,$3,'DO-NOT-EXPOSE-MESSAGE','in',now())",[a.seller_id,id(),t.conv]);
  await p.query("INSERT INTO trading.activity(seller_id,action,record_id,version,actor,reason) VALUES($1,'FOREIGN-PRIVATE',$2,1,'source','DO-NOT-EXPOSE-REASON')",[b.seller_id,foreign]);
  await slow.query('BEGIN');const delayed=(await slow.query("INSERT INTO trading.activity(seller_id,action,record_id,version,actor,reason) VALUES($1,'slow_commit',$2,1,'test','DO-NOT-EXPOSE-REASON') RETURNING id",[a.seller_id,id()])).rows[0].id;
  const fast=(await p.query("INSERT INTO trading.activity(seller_id,action,record_id,version,actor,reason) VALUES($1,'fast_commit',$2,1,'test','') RETURNING id",[a.seller_id,id()])).rows[0].id;
  const before=await(await get()).json();assert.ok(before.recent.some((r:{id:string})=>r.id===fast));assert.ok(!before.recent.some((r:{id:string})=>r.id===delayed));
  await slow.query('COMMIT');const response=await get(),body=await response.text(),after=JSON.parse(body);assert.equal(response.status,200);assert.ok(after.recent.some((r:{id:string})=>r.id===delayed));
  assert.ok(after.recent.length<=20);assert.ok(after.attention.length<=20);assert.equal(response.headers.get('cache-control'),'no-store');
  for(const secret of ['FOREIGN-PRIVATE',foreign,'DO-NOT-EXPOSE','instruction_snapshot','DEMO ONLY synthetic payment account',auth.token,auth.csrf])assert.ok(!body.includes(secret));
  assert.equal((await(await get('?limit=1')).json()).recent.length,1);
  for(const query of ['?limit=0','?limit=21','?limit=abc','?limit=1&limit=2','?seller_id='+b.seller_id,'?x='+'x'.repeat(129)])assert.equal((await get(query)).status,400);
  assert.equal((await fetch(base+'/updates',{method:'POST',headers:{cookie}})).status,405);
  await logout(p,auth.token);assert.equal((await get()).status,401);assert.equal((await fetch(base+'/updates')).status,401);
 }finally{await slow.query('ROLLBACK');slow.release();app.closeAllConnections();await new Promise<void>(r=>app.close(()=>r()));await p.end();}
});
