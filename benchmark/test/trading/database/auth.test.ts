import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { accounts } from './helpers.js';
import { pool } from '../../../src/trading/db.js';
import { hashPassword } from '../../../src/trading/password.js';
import { login,logout,session } from '../../../src/trading/auth.js';
test('hashed sessions rotate expire revoke and forged sessions expose nothing; failures are bounded and generic',async()=>{
 const [a]=await accounts(), p=pool(), password=randomBytes(24).toString('hex');
 try {
 await p.query('UPDATE trading.sellers SET password_hash=$2 WHERE id=$1',[a.seller_id,await hashPassword(password)]);
 await p.query('DELETE FROM trading.login_limits');
 const s=await login(p,a.tenant,password); assert.equal((await session(p,s.token)).seller_id,a.seller_id);
 assert.equal(await session(p,randomBytes(32).toString('hex')),undefined);
 const next=await login(p,a.tenant,password,s.token); assert.equal(await session(p,s.token),undefined);
 await logout(p,next.token); assert.equal(await session(p,next.token),undefined);
 const expired=await login(p,a.tenant,password); await p.query("UPDATE trading.sessions SET expires_at=now()-interval '1 second' WHERE seller_id=$1",[a.seller_id]);
 assert.equal(await session(p,expired.token),undefined);
 for(let i=0;i<12;i++) await assert.rejects(login(p,'unknown',password),/^Error: login-failed$/);
 assert.ok((await p.query('SELECT attempts FROM trading.login_limits')).rows[0].attempts<=10);
 }finally {await p.end();}
});
