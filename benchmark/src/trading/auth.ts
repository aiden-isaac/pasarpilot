import { createHash, randomBytes } from 'node:crypto';
import type pg from 'pg';
import { tx } from './db.js';
import { hashPassword, verifyPassword } from './password.js';
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
const dummy=hashPassword(randomBytes(24).toString('hex'));
export async function session(p:pg.Pool,token:string|undefined) {
 if(!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
 return (await p.query('SELECT seller_id,csrf FROM trading.sessions WHERE hash=$1 AND NOT revoked AND expires_at>clock_timestamp()',[digest(token)])).rows[0];
}
export async function logout(p:pg.Pool,token:string) { await p.query('UPDATE trading.sessions SET revoked=true WHERE hash=$1',[digest(token)]); }
export async function login(p:pg.Pool,name:string,password:string,old?:string) {
 const allowed=await tx(p,async c=>{
  await c.query("INSERT INTO trading.login_limits VALUES('loopback',0,now()+interval '1 minute') ON CONFLICT DO NOTHING");
  const r=(await c.query("SELECT *,until_at<=clock_timestamp() AS expired FROM trading.login_limits WHERE key='loopback' FOR UPDATE")).rows[0];
  if(r.expired) await c.query("UPDATE trading.login_limits SET attempts=1,until_at=clock_timestamp()+interval '1 minute' WHERE key='loopback'");
  else if(r.attempts>=10) return false;
  else await c.query("UPDATE trading.login_limits SET attempts=attempts+1 WHERE key='loopback'");
  return true;
 });
 if(!allowed) throw Error('login-failed');
 const user=(await p.query('SELECT id,password_hash FROM trading.sellers WHERE login=$1',[name.slice(0,200)])).rows[0];
 if(!await verifyPassword(password,user?.password_hash??await dummy) || !user) throw Error('login-failed');
 const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
 await tx(p,async c=>{
  if(old) await c.query('UPDATE trading.sessions SET revoked=true WHERE hash=$1',[digest(old)]);
  await c.query("INSERT INTO trading.sessions(hash,seller_id,csrf,expires_at) VALUES($1,$2,$3,now()+interval '8 hours')",[digest(token),user.id,csrf]);
 });
 return {token,csrf,seller_id:user.id};
}
