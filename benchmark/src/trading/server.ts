import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import { login,logout,session } from './auth.js';
import { Workspace } from './workspace.js';
import { safeReturn } from './navigation.js';
import { stylesheet,script } from './assets.js';
export const escape=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const field=(name:string,label:string,value:unknown='',type='text')=>`<label>${escape(label)} <input name="${escape(name)}" type="${type}" value="${escape(value)}" required></label> `;
export const hidden=(name:string,value:unknown)=>`<input type="hidden" name="${escape(name)}" value="${escape(value)}">`;
export const form=(path:string,csrf:string,body:string,button:string)=>`<form method="post" action="${path}">${hidden('csrf',csrf)}${body}<button>${escape(button)}</button></form>`;
export type Mutation=(w:Workspace,path:string,f:URLSearchParams)=>Promise<void|string>;
export type View=(w:Workspace,csrf:string,url:URL)=>Promise<string>;
export function server(p:pg.Pool,mutate:Mutation=async()=>{throw Error('not-found');},view:View=async()=>'<p>Inventory and trading workspace</p>') {
 const app=createServer(async(req,res)=>{
  res.setHeader('Content-Security-Policy',"default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; style-src 'self'; script-src 'self'; connect-src 'self'");
  res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','text/html; charset=utf-8');
  const send=(status:number,html:string)=>{res.statusCode=status;res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PasarPilot synthetic WTS</title><link rel="stylesheet" href="/assets/workspace.css"><script src="/assets/workspace.js" defer></script></head><body><a class="skip-link" href="#main">Skip to content</a><header class="brand"><h1><a href="/">PasarPilot</a></h1><span class="environment">Synthetic WTS</span></header><main id="main" tabindex="-1">${html}</main></body></html>`);};
  try {
   const addr=app.address(); if(!addr || typeof addr==='string') throw Error('invalid-server');
   const origin=`http://127.0.0.1:${addr.port}`;
   if(req.headers.host!==`127.0.0.1:${addr.port}`) {send(403,'Invalid host');return;}
   const url=new URL(req.url??'/',origin), path=url.pathname;
   if(req.method==='GET'&&['/assets/workspace.css','/assets/workspace.js'].includes(path)){
    res.setHeader('Content-Type',path.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');res.end(path.endsWith('.css')?stylesheet:script);return;
   }
   const cookie=(name:string)=>req.headers.cookie?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1];
   const token=cookie('session'), auth=await session(p,token);
   if(req.method==='GET' && path==='/login') {
    const csrf=randomBytes(32).toString('hex'); res.setHeader('Set-Cookie',`login_csrf=${csrf}; HttpOnly; SameSite=Strict; Path=/; Max-Age=600`);
    send(200,form('/login',csrf,field('login','Seller login')+field('password','Password','','password'),'Log in'));return;
   }
   if(req.method==='POST') {
    if(req.headers.origin!==origin || !req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) {send(403,'Same-origin form required');return;}
    let body=''; for await(const b of req){body+=b;if(Buffer.byteLength(body)>16384){send(413,'Form too large');return;}}
    const f=new URLSearchParams(body); if([...f.keys()].some(k=>f.getAll(k).length!==1)) throw Error('duplicate-fields');
    if(!f.get('csrf') || f.get('csrf')!==(path==='/login'?cookie('login_csrf'):auth?.csrf)) {send(403,'Invalid CSRF context');return;}
    let destination:string|void=undefined;
    if(path==='/login') {
     const s=await login(p,f.get('login')??'',f.get('password')??'',token);
     res.setHeader('Set-Cookie',`session=${s.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
    } else {
     if(!auth){send(401,'Log in required');return;}
     if(path==='/logout') {await logout(p,token!);res.setHeader('Set-Cookie','session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');}
     else destination=await mutate(new Workspace(p,auth.seller_id),path,f);
    }
    res.writeHead(303,{Location:path==='/logout'?'/login':safeReturn(destination??f.get('return')??'/')});res.end();return;
   }
   if(req.method!=='GET'){send(405,'Method not allowed');return;}
   if(!auth){send(401,'<a href="/login">Log in</a>');return;}
   send(200,'<div class="session-actions">'+form('/logout',auth.csrf,'','Log out')+'</div>'+await view(new Workspace(p,auth.seller_id),auth.csrf,url));
  }catch(e){const message=e instanceof Error?e.message:'request-failed';const safe=/^(not-found|login-failed|stale|invalid|positive|MYR|overflow|held|closed|unavailable|review|payment|fulfilment|instructions)/.test(message)?message:'Request rejected; check values and refresh.';send(409,`<p role="alert">${escape(safe)}</p><a href="/">Refresh workspace</a>`);}
 });
 app.requestTimeout=10000; app.headersTimeout=10000; return app;
}
export async function listen(p:pg.Pool,port=8787,mutate?:Mutation,view?:View) {
 const app=server(p,mutate,view); await new Promise<void>(resolve=>app.listen(port,'127.0.0.1',resolve)); return app;
}
