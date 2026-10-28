import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { accounts,id,trade } from './helpers.js';
import { pool,queue } from '../../../src/trading/db.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { generate } from '../../../src/trading/intake.js';
import { login } from '../../../src/trading/auth.js';
import { hashPassword } from '../../../src/trading/password.js';
import { listen } from '../../../src/trading/server.js';
import { mutate,view } from '../../../src/trading/dashboard.js';

test('HTTP and CLI generation serialize positions and stable replay retains one event/effect with conflicts quarantined',async()=>{
 const [a,b]=await accounts(),p=pool(),w=new Workspace(p,a.seller_id),boss=queue(p),password=randomBytes(24).toString('hex');
 await p.query('UPDATE trading.sellers SET password_hash=$2 WHERE id=$1',[w.seller,await hashPassword(password)]);await p.query('DELETE FROM trading.login_limits');const auth=await login(p,a.tenant,password),app=await listen(p,0,mutate,view),addr=app.address();assert.ok(addr&&typeof addr!=='string');const base=`http://127.0.0.1:${addr.port}`;
 try{
  const t=await trade(w),run=id(),one=run+':claim-a',two=run+':backup-b';
  const http=()=>fetch(base+'/synthetic',{method:'POST',redirect:'manual',headers:{cookie:`session=${auth.token}`,origin:base,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:auth.csrf,event:one,item:t.item,buyer:'buyer-a',kind:'reply',text:'claim'})});
  const cli=(event:string,buyer:string)=>promisify(execFile)(process.execPath,['dist/src/trading/cli.js','generate',a.tenant,t.item,buyer,'claim',event],{env:process.env,timeout:15000});
  const [response]=await Promise.all([http(),cli(two,'buyer-b')]);assert.equal(response.status,303);
  const events=async()=>(await p.query('SELECT id,position,envelope FROM trading.inbox WHERE seller_id=$1 AND event_id=ANY($2) ORDER BY position',[w.seller,[one,two]])).rows;
  const before=await events();assert.equal(before.length,2);assert.equal(before[1]!.position,before[0]!.position+1);
  const audit=(await p.query('SELECT count(*)::int n FROM trading.activity WHERE seller_id=$1',[w.seller])).rows[0].n;
  await Promise.all([http(),cli(one,'buyer-a')]);assert.deepEqual(await events(),before);assert.equal((await p.query('SELECT count(*)::int n FROM trading.activity WHERE seller_id=$1',[w.seller])).rows[0].n,audit);
  assert.equal((await w.get('inventory',t.inv)).reserved,1);assert.equal((await w.children('items',t.item,'orders')).rows.length,1);
  const input={event:one,item:t.item,actor:'buyer-a',message:'changed claim',kind:'reply' as const};
  await assert.rejects(generate(p,boss,a.tenant,input),/identity-conflict/);await assert.rejects(generate(p,boss,a.tenant,input),/identity-conflict/);
  assert.equal((await p.query('SELECT count(*)::int n FROM trading.conflicts WHERE seller_id=$1 AND id=$2',[w.seller,before.find(r=>r.envelope.event===one)!.id])).rows[0].n,1);
  await assert.rejects(generate(p,boss,b.tenant,{...input,event:id()}),/not-found/);
  const other=await trade(new Workspace(p,b.seller_id));await generate(p,boss,b.tenant,{...input,event:one,item:other.item,message:'claim'});
  assert.deepEqual(await events(),before);
 }finally{app.closeAllConnections();await new Promise<void>(r=>app.close(()=>r()));await p.end();}
});
