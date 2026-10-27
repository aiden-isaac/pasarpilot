import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright';
import { join } from 'node:path';
import { accounts,payable } from '../database/helpers.js';
import { pool } from '../../../src/trading/db.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { login } from '../../../src/trading/auth.js';
import { hashPassword } from '../../../src/trading/password.js';
import { listen } from '../../../src/trading/server.js';
import { view,mutate } from '../../../src/trading/dashboard.js';

test('visible-tab checks preserve editing, pause hidden, serialize requests and back off before relogin',{timeout:60000},async t=>{
 const [a]=await accounts(),p=pool(),password=randomBytes(24).toString('hex');await p.query('UPDATE trading.sellers SET password_hash=$2 WHERE id=$1',[a.seller_id,await hashPassword(password)]);await p.query('DELETE FROM trading.login_limits');const auth=await login(p,a.tenant,password),record=await payable(new Workspace(p,a.seller_id));
 const app=await listen(p,0,mutate,view),addr=app.address();assert.ok(addr&&typeof addr!=='string');const base=`http://127.0.0.1:${addr.port}`;
 let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined,release=()=>{};
 try{
  t.signal.addEventListener('abort',()=>void browser?.close(),{once:true});browser=await chromium.launch({headless:true,chromiumSandbox:true,...(process.env.TRADING_BROWSER?{executablePath:process.env.TRADING_BROWSER}:{})});const context=await browser.newContext({reducedMotion:'reduce',viewport:{width:390,height:844}});await context.addCookies([{name:'session',value:auth.token,url:base}]);const page=await context.newPage();page.setDefaultTimeout(5000);await page.clock.install();let requests=0;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/updates',async route=>{requests++;if(requests===2)await gate;await route.fulfill({status:requests===1?200:requests>=5?401:503,contentType:'application/json',body:JSON.stringify({checkedAt:new Date().toISOString(),recent:[{id:'1',action:'hold_created',actor:'buyer-a'}],attention:[{id:'1',kind:'review',version:1}]})});});
  await page.goto(`${base}/?view=inventory&id=${record.inv}`);const name=page.getByLabel('name',{exact:true});await name.fill('In-progress seller edit');await name.focus();await name.evaluate(input=>(input as HTMLInputElement).setSelectionRange(2,5));
  const editing=()=>page.evaluate(()=>{const input=document.querySelector('input[name="name"]') as HTMLInputElement;return{value:input.value,version:(document.querySelector('form[action="/inventory"] input[name="version"]') as HTMLInputElement).value,active:document.activeElement===input,start:input.selectionStart,end:input.selectionEnd,x:scrollX,y:scrollY};});
  const before=await editing();await page.clock.fastForward(9999);assert.equal(requests,0);await page.clock.fastForward(1);await page.getByText('Seller review: 1',{exact:false}).waitFor();assert.equal(requests,1);assert.deepEqual(await editing(),before);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await page.clock.fastForward(60000);assert.equal(requests,1);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});const second=page.waitForRequest('**/updates');await page.clock.fastForward(10000);await second;
  await page.clock.fastForward(7000);assert.equal(requests,2);release();await page.getByText('Could not check local data.',{exact:false}).waitFor();
  for(const delay of [20000,40000,60000]){const count:number=requests;await page.clock.fastForward(delay-1);assert.equal(requests,count);const response=page.waitForResponse(value=>value.url().endsWith('/updates'));await page.clock.fastForward(1);await response;await page.evaluate(()=>0);}
  await page.getByRole('link',{name:'Sign in again',exact:true}).waitFor();const stopped=requests;await page.clock.fastForward(600000);assert.equal(requests,stopped);assert.deepEqual(await editing(),before);
  if(process.env.TRADING_UI_EVIDENCE){await page.locator('#freshness').scrollIntoViewIfNeeded();await page.screenshot({path:join(process.env.TRADING_UI_EVIDENCE,'freshness-relogin.png')});}
 }finally{release();await browser?.close();app.closeAllConnections();await new Promise<void>(r=>app.close(()=>r()));await p.end();}
});
