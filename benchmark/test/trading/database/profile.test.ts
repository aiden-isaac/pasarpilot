import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { accounts,id } from './helpers.js';
import { pool } from '../../../src/trading/db.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { profile } from '../../../src/trading/profile.js';
import { login,logout } from '../../../src/trading/auth.js';
import { hashPassword } from '../../../src/trading/password.js';
import { listen } from '../../../src/trading/server.js';
import { mutate,view } from '../../../src/trading/dashboard.js';

test('display profiles are seller/version scoped, audited and independent of credentials and payment settings across logout/restart',async()=>{
 const [a,b]=await accounts(),p=pool(),w=new Workspace(p,a.seller_id),password=randomBytes(24).toString('hex');
 await p.query('UPDATE trading.sellers SET password_hash=$2 WHERE id=$1',[w.seller,await hashPassword(password)]);await p.query('DELETE FROM trading.login_limits');
 const auth=await login(p,a.tenant,password),app=await listen(p,0,mutate,view),addr=app.address();assert.ok(addr&&typeof addr!=='string');const base=`http://127.0.0.1:${addr.port}`;
 const post=(fields:Record<string,string>)=>fetch(base+'/profile',{method:'POST',redirect:'manual',headers:{cookie:`session=${auth.token}`,origin:base,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:auth.csrf,...fields})});
 let version:number,name:string;
 try{
  const before=(await p.query('SELECT * FROM trading.sellers WHERE id=$1',[w.seller])).rows[0],foreign=(await p.query('SELECT * FROM trading.sellers WHERE id=$1',[b.seller_id])).rows[0];
  version=before.profile_version;name='Synthetic seller '+id();
  assert.equal((await post({version:String(version),display_name:name,csrf:'forged'})).status,403);
  assert.equal((await post({version:String(version),display_name:name,seller_id:b.seller_id})).status,409);
  for(const invalid of ['','x'.repeat(81),'<script>synthetic</script>','line\nbreak'])await assert.rejects(profile(w,version,invalid),/invalid/);
  assert.equal((await post({version:String(version),display_name:name})).status,303);
  await assert.rejects(profile(w,version,'Stale overwrite'),/stale-profile/);
  const after=(await p.query('SELECT * FROM trading.sellers WHERE id=$1',[w.seller])).rows[0];
  assert.equal(after.display_name,name);assert.equal(after.profile_version,version+1);
  for(const key of ['login','password_hash','instructions','instructions_approved','instruction_version'])assert.deepEqual(after[key],before[key]);
  assert.deepEqual((await p.query('SELECT * FROM trading.sellers WHERE id=$1',[b.seller_id])).rows[0],foreign);
  assert.equal((await p.query("SELECT count(*)::int n FROM trading.activity WHERE seller_id=$1 AND action='profile_saved' AND version=$2",[w.seller,version+1])).rows[0].n,1);
  await logout(p,auth.token);
 }finally{app.closeAllConnections();await new Promise<void>(r=>app.close(()=>r()));await p.end();}
 const restarted=pool();try{const session=await login(restarted,a.tenant,password);assert.equal(session.seller_id,w.seller);const html=await view(new Workspace(restarted,w.seller),session.csrf,new URL(base+'/?view=settings'));assert.ok(html.includes(name!));await logout(restarted,session.token);}finally{await restarted.end();}
});
