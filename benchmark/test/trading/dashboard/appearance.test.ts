import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join,isAbsolute } from 'node:path';
import { randomBytes } from 'node:crypto';
import { accounts,payable } from '../database/helpers.js';
import { pool } from '../../../src/trading/db.js';
import { Workspace } from '../../../src/trading/workspace.js';
import { hashPassword } from '../../../src/trading/password.js';
import { login } from '../../../src/trading/auth.js';
import { listen } from '../../../src/trading/server.js';
import { view,mutate } from '../../../src/trading/dashboard.js';

test('seller views reflow with visible keyboard focus, large targets, accessible contrast and both appearances',{timeout:60000},async t=>{
 const [a]=await accounts(),p=pool(),password=randomBytes(24).toString('hex');
 await p.query('UPDATE trading.sellers SET password_hash=$2 WHERE id=$1',[a.seller_id,await hashPassword(password)]);
 await p.query('DELETE FROM trading.login_limits');const auth=await login(p,a.tenant,password),order=await payable(new Workspace(p,a.seller_id));
 const app=await listen(p,0,mutate,view),addr=app.address();assert.ok(addr&&typeof addr!=='string');const base=`http://127.0.0.1:${addr.port}`;
 let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 try{
  t.signal.addEventListener('abort',()=>void browser?.close(),{once:true});
  browser=await chromium.launch({headless:true,chromiumSandbox:true,...(process.env.TRADING_BROWSER?{executablePath:process.env.TRADING_BROWSER}:{})});
  const context=await browser.newContext();await context.addCookies([{name:'session',value:auth.token,url:base,httpOnly:true,sameSite:'Strict'}]);
  const page=await context.newPage();const scriptErrors:string[]=[];page.on('pageerror',error=>scriptErrors.push(error.message));page.setDefaultTimeout(5000);
  const output=process.env.TRADING_UI_EVIDENCE;if(output){assert.ok(isAbsolute(output));mkdirSync(output,{recursive:true,mode:0o700});}
  for(const colorScheme of ['light','dark'] as const){
   await page.emulateMedia({colorScheme,reducedMotion:'reduce'});
   for(const width of [1280,390,360,320]){
    await page.setViewportSize({width,height:800});await page.goto(`${base}/?view=orders&id=${order.order}`);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${colorScheme} ${width} overflow`);
    const undersized=await page.locator('a,button,input:not([type="hidden"]):not([type="checkbox"]),select,summary,label:has(input[type="checkbox"])').evaluateAll(nodes=>nodes.filter(node=>node.getClientRects().length).filter(node=>{const r=node.getBoundingClientRect();return r.width<43.9||r.height<43.9;}).map(node=>node.textContent?.slice(0,60)||node.tagName));
    assert.deepEqual(undersized,[],`${colorScheme} ${width} targets`);
    await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').textContent(),'Skip to content');await page.keyboard.press('Enter');assert.equal(await page.locator(':focus').getAttribute('id'),'main');
    await page.keyboard.press('Tab');assert.notEqual(await page.locator(':focus').evaluate(el=>getComputedStyle(el).outlineStyle),'none');
    assert.equal(await page.locator('button').first().evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
    if(output&&(width===1280||width===360))await page.screenshot({path:join(output,`${colorScheme}-${width}.png`)});
   }
   const ratios=await page.evaluate(()=>{
    const s=getComputedStyle(document.documentElement),luminance=(hex:string)=>{let value=hex.trim().slice(1);if(value.length===3)value=[...value].map(c=>c+c).join('');const rgb=value.match(/../g)!.map(c=>parseInt(c,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]!*.2126+rgb[1]!*.7152+rgb[2]!*.0722;};
    const ratio=(a:string,b:string)=>{const x=luminance(s.getPropertyValue(a)),y=luminance(s.getPropertyValue(b));return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
    return {text:ratio('--text','--surface'),secondary:ratio('--secondary','--page'),accent:ratio('--accent','--tint'),button:ratio('--accent-text','--accent'),control:ratio('--control','--surface')};
   });
   for(const [role,ratio]of Object.entries(ratios))assert.ok(ratio>=(role==='control'?3:4.5),`${colorScheme} ${role}: ${ratio}`);
   console.log(JSON.stringify({appearance:colorScheme,contrast:ratios}));
  }
  await page.setViewportSize({width:1280,height:800});await page.goto(`${base}/?view=inventory&q=definitely-no-synthetic-match`);assert.match(await page.locator('main').innerText(),/No matching inventory. Change or clear your search/);
  // Double the text size while retaining the 320 CSS px reflow check above.
  await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});await page.setViewportSize({width:320,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(output)await page.screenshot({path:join(output,'text-200-percent.png')});
  const zoom=await browser.newContext({viewport:{width:640,height:400},deviceScaleFactor:2});await zoom.addCookies(await context.cookies());
  const zoomPage=await zoom.newPage();await zoomPage.goto(`${base}/?view=orders&id=${order.order}`);
  assert.equal(await zoomPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(output)await zoomPage.screenshot({path:join(output,'zoom-200-percent-equivalent.png')});await zoom.close();
  await page.goto(`${base}/?view=orders&id=missing-owned-order`);assert.equal(await page.getByRole('alert').count(),1);
  await page.goto(`${base}/?view=settings`);await page.clock.install();assert.deepEqual(scriptErrors,[]);
  // Keep the submitting document visible while a separate HTTP client withholds its acknowledgement.
  await page.locator('form[action="/profile"]').evaluate(form=>form.addEventListener('submit',event=>event.preventDefault(),{once:true}));
  await page.getByLabel('Display name',{exact:true}).fill('Pending synthetic seller');
  await page.getByRole('button',{name:'Save display profile',exact:true}).click();
  assert.match(await page.locator('[data-pending]').innerText(),/Waiting for the server result/);
  assert.equal(await page.getByRole('button',{name:'Save display profile',exact:true}).isDisabled(),true);
  const body=await page.locator('form[action="/profile"]').evaluate(form=>new URLSearchParams([...new FormData(form as HTMLFormElement)].map(([key,value])=>[key,String(value)])).toString());
  const saved=await context.request.post(base+'/profile',{headers:{origin:base,'content-type':'application/x-www-form-urlencoded'},data:body});assert.equal(saved.status(),200);
  await page.clock.fastForward(15001);assert.match(await page.locator('[data-pending]').innerText(),/Response not confirmed/);
  if(output){await page.locator('[data-pending]').scrollIntoViewIfNeeded();await page.screenshot({path:join(output,'uncertain-response.png')});}
  await page.getByRole('link',{name:'Inspect current state',exact:true}).click();assert.match(await page.locator('.workspace-header').innerText(),/Pending synthetic seller/);
 }finally{await browser?.close();app.closeAllConnections();await new Promise<void>(r=>app.close(()=>r()));await p.end();}
});
