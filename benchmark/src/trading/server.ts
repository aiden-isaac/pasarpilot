import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import { login,logout,session } from './auth.js';
import { Workspace } from './workspace.js';
import { safeReturn } from './navigation.js';
import { stylesheet,script } from './assets.js';
import { text } from './values.js';
import { updates } from './updates.js';
export const escape=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const field=(name:string,label:string,value:unknown='',type='text')=>`<label>${escape(label)} <input name="${escape(name)}" type="${type}" value="${escape(value)}" required></label> `;
export const hidden=(name:string,value:unknown)=>`<input type="hidden" name="${escape(name)}" value="${escape(value)}">`;
export const form=(path:string,csrf:string,body:string,button:string)=>`<form method="post" action="${path}"${['/cancel','/complete','/confirm-payment'].includes(path)?' class="critical"':''}>${hidden('csrf',csrf)}${body}<button>${escape(button)}</button></form>`;
export type Mutation=(w:Workspace,path:string,f:URLSearchParams)=>Promise<void|string>;
export type Feedback={path:string;fields:URLSearchParams;field:string;message:string};
export type View=(w:Workspace,csrf:string,url:URL,feedback?:Feedback)=>Promise<string>;
export function recoverForm(html:string,feedback?:Feedback){
 if(!feedback)return html;
 return html.replace(/<input\b[^>]*>/g,tag=>{
  const name=tag.match(/name="([^"]+)"/)?.[1];if(!name||!feedback.fields.has(name))return tag;
  const value=escape(feedback.fields.get(name));
  tag=/value="[^"]*"/.test(tag)?tag.replace(/value="[^"]*"/,()=>`value="${value}"`):tag.replace(/>$/,()=>` value="${value}">`);
  if(name===feedback.field)tag=tag.replace('>',` id="correction-${name}" aria-invalid="true" aria-describedby="field-issue">`);
  return tag;
 }).replace(/<select name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g,(all,name:string,options:string)=>{
  if(!feedback.fields.has(name))return all;
  const updated=all.replace(options,()=>options.replace(/<option value="([^"]+)"(?: selected)?>/g,(_,value:string)=>`<option value="${value}"${value===escape(feedback.fields.get(name))?' selected':''}>`));
  return name===feedback.field?updated.replace('<select ',`<select id="correction-${name}" aria-invalid="true" aria-describedby="field-issue" `):updated;
 });
}
function explanation(code:string,path:string,fields:URLSearchParams){
 if(code==='login-failed')return {field:'',message:'Sign-in failed. Check your invitation details or wait a minute before trying again.'};
 if(code==='not-found')return {field:'',message:'This record is unavailable. Return to your workspace and choose an owned record.'};
 if(/stale|conflict/.test(code))return {field:'',message:'This record changed or its stock is held. Inspect the current state below, then refresh before deciding a new action. Your old version has not been silently replaced.'};
 if(code==='invalid-explicit-confirmation')return {field:'',message:'Open the review page and explicitly confirm the intended action. No critical action was authorized by this submission.'};
 if(/payment|review/.test(code))return {field:'',message:'Payment or review needs attention. Inspect the current amount, hold deadline, approved request and seller interventions before retrying. Buyer evidence cannot verify payment.'};
 if(/fulfilment|completion/.test(code))return {field:'',message:'Check the agreed arrangements, verified payment, actual receipt and unresolved reviews before recording this step.'};
 if(/instructions/.test(code))return {field:'',message:'Check approved synthetic instructions and the agreed fulfilment fee, then inspect or regenerate the current proposal.'};
 if(/MYR|overflow|invalid|positive/.test(code)){
  let field=path==='/profile'?'display_name':path==='/terms'?'fee':path==='/item'?'offered':'';
  if(path==='/inventory'){
   if(/variant/.test(code))field=!['nonfoil','foil','etched','other'].includes(fields.get('finish')??'')?'finish':'condition';
   else if(/MYR/.test(code))field='price';
   else if(code==='invalid-text')field=['name','printing','collector','language'].find(key=>{try{text(fields.get(key));return false;}catch{return true;}})??'';
   else field=Number.isInteger(Number(fields.get('unsold')))&&Number(fields.get('unsold'))>=0&&Number(fields.get('unsold'))<=2147483647?'price':'unsold';
  }
  const names:Record<string,string>={price:'MYR asking price',fee:'MYR fee',unsold:'Unsold quantity',offered:'Offered quantity',display_name:'Display name',name:'Card name',printing:'Printing',collector:'Collector number',language:'Language',finish:'Finish',condition:'Condition'};
  const help=field==='display_name'?'Use 1–80 characters of plain single-line text.':field==='finish'||field==='condition'?'Choose one of the supplied values.':field==='unsold'||field==='offered'?'Use a whole quantity within the supported stock bounds.':field==='price'||field==='fee'?'Use a nonnegative MYR amount with up to two decimals.':'Use a nonempty value of at most 200 characters.';
  return {field,message:field?`${names[field]} needs correction. ${help}`:'Check the selected values and required fields, then submit the correction.'};
 }
 return {field:'',message:'The result could not be confirmed. Inspect current state and activity before retrying; reconnect or sign in again if needed. No success is assumed.'};
}
export function server(p:pg.Pool,mutate:Mutation=async()=>{throw Error('not-found');},view:View=async()=>'<p>Inventory and trading workspace</p>') {
 const app=createServer(async(req,res)=>{
  let context:{w:Workspace;csrf:string;url:URL;path:string;fields:URLSearchParams}|undefined;
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
   if(auth)context={w:new Workspace(p,auth.seller_id),csrf:auth.csrf,url,path,fields:new URLSearchParams()};
   if(path==='/updates'){
    res.setHeader('Content-Type','application/json; charset=utf-8');
    if(req.method!=='GET'){res.statusCode=405;res.end(JSON.stringify({error:'read-only'}));return;}
    if(!auth){res.statusCode=401;res.end(JSON.stringify({error:'sign-in-required'}));return;}
    try{res.end(JSON.stringify(await updates(new Workspace(p,auth.seller_id),url)));}catch(error){if(error instanceof Error&&error.message.startsWith('invalid-update')){res.statusCode=400;res.end(JSON.stringify({error:'invalid-query'}));return;}throw error;}
    return;
   }
   if(req.method==='GET' && path==='/login') {
    const csrf=randomBytes(32).toString('hex'); res.setHeader('Set-Cookie',`login_csrf=${csrf}; HttpOnly; SameSite=Strict; Path=/; Max-Age=600`);
    send(200,'<section><h2>Seller sign in</h2><p>Use your operator-provided invitation. This loopback workspace uses synthetic buyers and simulated replies only; no Facebook credentials or real banking connection are required.</p>'+form('/login',csrf,field('login','Seller login')+field('password','Password','','password'),'Log in')+'</section>');return;
   }
   if(req.method==='POST') {
    if(req.headers.origin!==origin || !req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) {send(403,'<p role="alert">This submission could not be accepted from this page.</p><a href="/">Return to workspace</a>');return;}
    let body=''; for await(const b of req){body+=b;if(Buffer.byteLength(body)>16384){send(413,'Form too large');return;}}
    const f=new URLSearchParams(body); if([...f.keys()].some(k=>f.getAll(k).length!==1)) throw Error('duplicate-fields');
    if(path!=='/login'&&!auth){send(401,'<p role="alert">Your session expired or was revoked. Sign in again, then inspect current state before retrying. Private form details are not retained.</p><a href="/login">Sign in again</a>');return;}
    if(!f.get('csrf') || f.get('csrf')!==(path==='/login'?cookie('login_csrf'):auth?.csrf)) {send(403,'<p role="alert">This form expired or could not be verified. Refresh the current page before submitting again.</p><a href="/">Return to workspace</a>');return;}
    if(context&&path!=='/login'){
     const allowed=['run','event','return','id','version','name','printing','collector','language','finish','condition','unsold','price','title','listing_id','inventory_id','offered','open','minimum','method','fee','display_name'];
     context.fields=new URLSearchParams([...f].filter(([key])=>allowed.includes(key)));
    }
    let destination:string|void=undefined;
    if(path==='/login') {
     const s=await login(p,f.get('login')??'',f.get('password')??'',token);
     res.setHeader('Set-Cookie',`session=${s.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
    } else {
     if(!auth){send(401,'Log in required');return;}
     if(path==='/logout') {await logout(p,token!);res.setHeader('Set-Cookie','session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');}
     else destination=await mutate(new Workspace(p,auth.seller_id),path,f);
    }
    const target=new URL(safeReturn(destination??f.get('return')??'/'),origin);if(path!=='/login'&&path!=='/logout')target.searchParams.set('notice','updated');
    res.writeHead(303,{Location:path==='/logout'?'/login':target.pathname+target.search});res.end();return;
   }
   if(req.method!=='GET'){send(405,'Method not allowed');return;}
   if(!auth){send(401,'<a href="/login">Log in</a>');return;}
   send(200,'<div class="session-actions">'+form('/logout',auth.csrf,'','Log out')+'</div>'+await view(new Workspace(p,auth.seller_id),auth.csrf,url));
  }catch(error){
   const feedback={...explanation(error instanceof Error?error.message:'request-failed',context?.path??'',context?.fields??new URLSearchParams()),path:context?.path??'',fields:context?.fields??new URLSearchParams()};
   let current='';const destination=safeReturn(context?.fields.get('return')||'/');
   if(context&&context.path!=='/login')try{current=await view(context.w,context.csrf,new URL(destination,'http://local'),feedback);}catch{/* Current state may be unavailable during a disconnect. */}
   send(409,`<section role="alert" tabindex="-1"><h2>Check this action</h2><p id="field-issue">${escape(feedback.message)}</p>${feedback.field&&current.includes(`id="correction-${feedback.field}"`)?`<a href="#correction-${escape(feedback.field)}">Correct the field</a>`:''}<p><a href="${escape(destination)}">Inspect refreshed state and activity</a> · <a href="/login">Sign in again</a></p></section>${current}`);
  }
 });
 app.requestTimeout=10000; app.headersTimeout=10000; return app;
}
export async function listen(p:pg.Pool,port=8787,mutate?:Mutation,view?:View) {
 const app=server(p,mutate,view); await new Promise<void>(resolve=>app.listen(port,'127.0.0.1',resolve)); return app;
}
