import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
const password = JSON.parse(readFileSync('/attempt/view.json', 'utf8')).password;
const browser = await chromium.launch({ headless: true, channel: 'chromium', chromiumSandbox: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:6080/');
  await page.evaluate(async password => {
    // noVNC is installed in the optional image; use its actual browser client, not a mock RFB connection.
    const load = Function('return import("/core/rfb.js")') as () => Promise<any>;
    const { default: RFB } = await load();
    await new Promise<void>((resolve, reject) => {
      const rfb = new RFB(document.body, 'ws://127.0.0.1:6080', { credentials: { password } });
      rfb.addEventListener('connect', () => resolve());
      rfb.addEventListener('securityfailure', () => reject(Error('viewer-security-failure')));
      setTimeout(() => reject(Error('viewer-connect-timeout')), 15000);
    });
  }, password);
  console.log(JSON.stringify({ connected: true }));
  for await (const _line of createInterface({ input: process.stdin })) break;
} finally { await browser.close(); }
