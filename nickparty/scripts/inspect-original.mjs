import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
const browser = await puppeteer.launch({ executablePath: process.env.BRAVE_PATH ?? 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe', headless: true, defaultViewport: { width: 1100, height: 700 } });
try {
  const page = await browser.newPage();
  await page.goto('http://localhost:8090/blockparty/index.html');
  await page.evaluate(() => { const style = document.createElement('style'); style.textContent = 'ruffle-player { height: 500px !important; }'; document.head.append(style); });
  await page.waitForFunction(() => window.__ruffle?.ready, { timeout: 60000 });
  await new Promise(r => setTimeout(r, 5000));
  await mkdir('screenshots/original', { recursive: true });
  await page.screenshot({ path: 'screenshots/original/menu.png' });
  const clicks = JSON.parse(process.env.ORIGINAL_CLICKS ?? '[]');
  for (let i = 0; i < clicks.length; i++) {
    await page.mouse.click(...clicks[i]);
    await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({ path: `screenshots/original/step-${i}.png` });
  }
  console.log('Original captured:', clicks.length + 1, 'frames');
} finally { await browser.close(); }
