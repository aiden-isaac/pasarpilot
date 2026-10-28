import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { randomBytes } from 'node:crypto';
import { id } from '../database/helpers.js';
import { pool } from '../../../src/trading/db.js';
import { listen } from '../../../src/trading/server.js';
import { mutate,view } from '../../../src/trading/dashboard.js';
import pg from 'pg';
import { migrate } from '../../../src/trading/migrate.js';
import { seed } from '../../../src/trading/setup.js';
import { join } from 'node:path';
for(const viewport of [{width:1280,height:800},{width:390,height:844},{width:360,height:800,noJavaScript:true}])test(`invited seller onboards and completes two guided RM10 sales with preserved histories at ${viewport.width}px`,{timeout:60000},async t=>{
 const admin=pool('fixture'),database=`seller_ui_${process.pid}_${viewport.width}`,password=randomBytes(24).toString('hex');
 await admin.query(`CREATE DATABASE ${database}`);const provision=new pg.Pool({host:process.env.PGHOST,user:'fixture',database});
 await migrate(provision);await seed(provision,[password,randomBytes(24).toString('hex')]);const [a]=(await provision.query('SELECT * FROM trading.sources ORDER BY tenant')).rows;await provision.end();
 const p=new pg.Pool({host:process.env.PGHOST,user:'trading_runtime',database,max:3});
 const app=await listen(p,0,mutate,view);const addr=app.address();assert.ok(addr&&typeof addr!=='string');
 let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 try{t.signal.addEventListener('abort',()=>void browser?.close(),{once:true});browser=await chromium.launch({headless:true,chromiumSandbox:true,...(process.env.TRADING_BROWSER?{executablePath:process.env.TRADING_BROWSER}:{})});
 const page=await browser.newPage({viewport,javaScriptEnabled:!('noJavaScript' in viewport)});page.setDefaultTimeout(5000);page.setDefaultNavigationTimeout(10000);await page.goto(`http://127.0.0.1:${addr.port}/login`);await page.getByLabel('Seller login').fill(a.tenant);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Log in',exact:true}).click();
 const base=`http://127.0.0.1:${addr.port}`;
 await page.goto(base+'/?view=settings');assert.match(await page.locator('#onboarding').innerText(),/1 of 6/);assert.match(await page.locator('#guidance').innerText(),/Negotiation is disabled by default/);await page.getByLabel('Display name',{exact:true}).fill('Invited synthetic seller');await page.getByRole('button',{name:'Save display profile',exact:true}).click();assert.match(await page.locator('.workspace-header').innerText(),/Invited synthetic seller/);
 if(process.env.TRADING_UI_EVIDENCE){await page.getByRole('heading',{name:'Display profile',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:join(process.env.TRADING_UI_EVIDENCE,`onboarding-${viewport.width}.png`)});}
 await page.goto(base+'/?view=inventory');await page.getByText('Add inventory',{exact:true}).first().click();
 const name=`Synthetic Bolt ${id()}`,title=`WTS ${id()}`;
 const add=page.locator('form[action="/inventory"]').filter({has:page.getByRole('button',{name:'Add inventory',exact:true})});
 await add.getByLabel('name',{exact:true}).fill(name);await add.getByLabel('printing',{exact:true}).fill('SYN');await add.getByLabel('collector',{exact:true}).fill('1');await add.getByRole('button').click();
 await page.goto(base+'/?view=listings');
 const postForm=page.locator('form[action="/listing"]').filter({has:page.getByRole('button',{name:'Create WTS post',exact:true})});await postForm.getByLabel('Post title').fill(title);await postForm.getByRole('button').click();
 await page.getByText('Map inventory to this listing',{exact:true}).click();
 const inv=(await p.query('SELECT id FROM trading.inventory WHERE seller_id=$1 AND name=$2',[a.seller_id,name])).rows[0].id;
 await page.getByLabel('Search inventory',{exact:true}).fill(name);await page.getByRole('button',{name:'Search',exact:true}).click();await page.getByRole('link',{name:new RegExp(name)}).click();await page.getByRole('button',{name:'Add mapped item comment',exact:true}).click();
 await page.goto(base+'/?view=settings');const config=page.locator('form[action="/instructions"]');await config.getByLabel('Synthetic payment instructions').fill('DEMO ONLY synthetic account');await config.getByLabel('Approved for sharing').selectOption('yes');await config.getByRole('button').click();assert.match(await page.locator('#onboarding').innerText(),/6 of 6/);assert.equal((await p.query('SELECT count(*)::int n FROM trading.deliveries')).rows[0].n,0);
 const completed:string[]=[];
 for(let cycle=0;cycle<2;cycle++){
  await page.goto(base+'/?view=demo');await page.getByRole('button',{name:'Create one-unit RM10 demo listing',exact:true}).click();await page.getByRole('button',{name:'Simulate Buyer A claim',exact:true}).click();await page.getByRole('button',{name:'Simulate Buyer B backup',exact:true}).click();
  const run=new URL(page.url()).searchParams.get('id')!,it='demo-item:'+run,inv='demo-inventory:'+run;
  assert.match(await page.locator('main').innerText(),/Backup · no stock reserved/);await page.getByRole('link',{name:'Continue with Buyer A order',exact:true}).click();
  const o=(await p.query('SELECT * FROM trading.orders WHERE seller_id=$1 AND item_id=$2',[a.seller_id,it])).rows[0];assert.ok(o);
 const order=page.locator(`#order-${o.id}`);await order.getByLabel('Agreed MYR fee').fill('0.00');await order.getByRole('button',{name:'Agree fulfilment fee',exact:true}).click();
 await page.locator(`#order-${o.id}`).getByRole('button',{name:'Propose payment request',exact:true}).click();
 const draft=(await p.query("SELECT id FROM trading.drafts WHERE seller_id=$1 AND order_id=$2 AND kind='payment'",[a.seller_id,o.id])).rows[0];
 await page.locator(`#draft-${draft.id}`).getByRole('button').click();assert.match(await page.locator(`#draft-${draft.id}`).innerText(),/Delivered to fixture/);
 await page.getByRole('link',{name:'Review payment verification',exact:true}).click();const payment=page.locator('form[action="/confirm-payment"]');assert.equal(await payment.getByLabel('Exact received MYR amount').inputValue(),'');await payment.getByLabel('Exact received MYR amount').fill('10.00');if(process.env.TRADING_UI_EVIDENCE&&cycle===1)await page.screenshot({path:join(process.env.TRADING_UI_EVIDENCE,`payment-review-${viewport.width}.png`),fullPage:true});await payment.getByLabel('I checked actual receipt',{exact:false}).check();await payment.getByRole('button').click();
 const arrangement=page.locator(`#order-${o.id} form[action="/arrange"]`);await arrangement.getByLabel('Collection / COD / drop-off location').fill('Synthetic game shop');await arrangement.getByLabel('Meeting time').fill(new Date().toISOString());await arrangement.getByRole('button').click();
 const handover=page.locator(`#order-${o.id} form[action="/fulfil"]`);await handover.getByLabel('Actual handover / receipt evidence').fill('Seller handed the card to synthetic buyer A');await handover.getByRole('button').click();
 await page.getByRole('link',{name:'Review completion',exact:true}).click();if(process.env.TRADING_UI_EVIDENCE&&cycle===1)await page.screenshot({path:join(process.env.TRADING_UI_EVIDENCE,`completion-review-${viewport.width}.png`),fullPage:true});await page.getByLabel('I confirm actual receipt or handover and completion',{exact:true}).check();await page.getByRole('button',{name:'Complete transaction',exact:true}).click();
 assert.equal((await p.query('SELECT state FROM trading.orders WHERE seller_id=$1 AND id=$2',[a.seller_id,o.id])).rows[0].state,'completed');
 assert.equal((await p.query("SELECT count(*)::int AS n FROM trading.orders WHERE seller_id=$1 AND item_id=$2 AND payment='seller_verified'",[a.seller_id,it])).rows[0].n,1);
 assert.equal((await p.query('SELECT unsold FROM trading.inventory WHERE seller_id=$1 AND id=$2',[a.seller_id,inv])).rows[0].unsold,0);
 await page.getByRole('link',{name:'activity',exact:true}).click();assert.match(await page.locator('main').innerText(),/payment verified and stock committed/);
 assert.equal((await p.query("SELECT state FROM trading.claims WHERE seller_id=$1 AND item_id=$2 AND buyer='buyer-b'",[a.seller_id,it])).rows[0].state,'unfulfilled');
 completed.push(o.id);
 if(process.env.TRADING_SCREENSHOT&&cycle===1){
  await page.screenshot({path:process.env.TRADING_SCREENSHOT.replace('.png',`-${viewport.width}.png`),fullPage:true});
  await page.setViewportSize({width:360,height:800});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:process.env.TRADING_SCREENSHOT.replace('.png',`-${viewport.width}-mobile.png`),fullPage:true});
 }
 assert.equal((await p.query('SELECT reserved FROM trading.inventory WHERE seller_id=$1 AND id=$2',[a.seller_id,inv])).rows[0].reserved,0);
 }
 assert.equal((await p.query("SELECT count(*)::int n FROM trading.orders WHERE seller_id=$1 AND id=ANY($2) AND state='completed'",[a.seller_id,completed])).rows[0].n,2);
 assert.equal((await p.query("SELECT count(*)::int n FROM trading.activity WHERE seller_id=$1 AND record_id=ANY($2) AND action='payment_verified_and_stock_committed'",[a.seller_id,completed])).rows[0].n,2);
 assert.equal((await p.query("SELECT count(*)::int n FROM trading.deliveries d JOIN trading.drafts p USING(seller_id,id) WHERE d.seller_id=$1 AND p.order_id=ANY($2) AND p.kind='payment'",[a.seller_id,completed])).rows[0].n,2);
 }finally{await browser?.close();app.closeAllConnections();await new Promise<void>(r=>app.close(()=>r()));await p.end();await admin.query(`DROP DATABASE ${database}`);await admin.end();}
});
