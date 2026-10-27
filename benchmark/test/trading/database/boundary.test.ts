import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accounts,id } from './helpers.js';
import { pool } from '../../../src/trading/db.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { escape,listen } from '../../../src/trading/server.js';
test('seller-qualified reads hide foreign identifiers; loopback rejects forged mutations and escapes text',async()=>{
 const [a,b]=await accounts(),p=pool(),key=id();
 const app=await listen(p,0);const addr=app.address();assert.ok(addr && typeof addr!=='string'); const url=`http://127.0.0.1:${addr.port}`;
 try {
 await p.query('INSERT INTO trading.listings(seller_id,id,title) VALUES($1,$2,$3)',[b.seller_id,key,'private']);
 await assert.rejects(new Workspace(p,a.seller_id).get('listings',key),/not-found/);
 assert.equal((await fetch(url)).status,401);assert.equal((await fetch(url+'/logout',{method:'POST'})).status,403);
 assert.equal(escape('<script>"&'),'&lt;script&gt;&quot;&amp;');
 }finally {app.closeAllConnections();await new Promise<void>(r=>app.close(()=>r()));await p.end();}
});
