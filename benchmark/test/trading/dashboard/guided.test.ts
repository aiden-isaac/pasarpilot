import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { accounts } from '../database/helpers.js';
import { pool } from '../../../src/trading/db.js';
import { login } from '../../../src/trading/auth.js';
import { hashPassword } from '../../../src/trading/password.js';
import { listen } from '../../../src/trading/server.js';
import { view,mutate } from '../../../src/trading/dashboard.js';
test('browser-only guide creates a scoped run and A hold/B backup without approving payment or delivery',{timeout:30000},async t=>{
 const [a]=await accounts(),p=pool(),password=randomBytes(24).toString('hex');await p.query('UPDATE trading.sellers SET password_hash=$2 WHERE id=$1',[a.seller_id,await hashPassword(password)]);await p.query('DELETE FROM trading.login_limits');const auth=await login(p,a.tenant,password),app=await listen(p,0,mutate,view),addr=app.address();assert.ok(addr&&typeof addr!=='string');const base=`http://127.0.0.1:${addr.port}`;
 let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 try{t.signal.addEventListener('abort',()=>void browser?.close(),{once:true});browser=await chromium.launch({headless:true,chromiumSandbox:true,...(process.env.TRADING_BROWSER?{executablePath:process.env.TRADING_BROWSER}:{})});const context=await browser.newContext({viewport:{width:390,height:844}});await context.addCookies([{name:'session',value:auth.token,url:base}]);const page=await context.newPage();page.setDefaultTimeout(5000);
  await page.goto(base+'/?view=demo');await page.getByRole('button',{name:'Create one-unit RM10 demo listing',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Simulate Buyer B backup',exact:true}).count(),0);
  await page.getByRole('button',{name:'Simulate Buyer A claim',exact:true}).click();await page.getByRole('button',{name:'Simulate Buyer B backup',exact:true}).click();assert.match(await page.locator('main').innerText(),/Backup · no stock reserved/);assert.equal(await page.getByRole('link',{name:'Continue with Buyer A order',exact:true}).count(),1);
  const run=new URL(page.url()).searchParams.get('id')!,item='demo-item:'+run,order=(await p.query('SELECT * FROM trading.orders WHERE seller_id=$1 AND item_id=$2',[a.seller_id,item])).rows[0];assert.equal(order.payment,'unverified');assert.equal(order.fee,null);
  assert.equal((await p.query('SELECT count(*)::int n FROM trading.deliveries d JOIN trading.drafts p USING(seller_id,id) WHERE d.seller_id=$1 AND p.item_id=$2',[a.seller_id,item])).rows[0].n,0);
  for(const width of [390,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);if(process.env.TRADING_UI_EVIDENCE)await page.screenshot({path:join(process.env.TRADING_UI_EVIDENCE,`guided-${width}.png`),fullPage:true});}
 }finally{await browser?.close();app.closeAllConnections();await new Promise<void>(r=>app.close(()=>r()));await p.end();}
});
