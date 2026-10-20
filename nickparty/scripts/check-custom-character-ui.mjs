import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';

const customIds = Object.keys(JSON.parse(readFileSync('shared/custom-characters.json', 'utf8')));
const browser = await puppeteer.launch({ executablePath: process.env.BRAVE_PATH ?? 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe', headless: true });
try {
  const page = await browser.newPage(), errors = [], missing = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('response', response => { if (response.status() >= 400 && response.url().includes('/assets/')) missing.push(response.url()); });
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173');
  await page.evaluate(async () => {
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { CharacterSprite } = await import('/src/CharacterSprite.tsx');
    const host = document.createElement('div'); host.id = 'custom-character-check';
    Object.assign(host.style, { position: 'fixed', inset: '0', background: '#28354c', display: 'grid', placeItems: 'center', zIndex: '999' });
    document.body.append(host); const root = ReactDOM.createRoot(host);
    window.showCustomState = (id, state, facing) => root.render(React.createElement(CharacterSprite, { id, state, facing, label: id }));
  });
  await mkdir('screenshots/custom', { recursive: true });
  for (const id of customIds) {
  for (const state of ['idle', 'walk', 'jump', 'hurt', 'win', 'lose']) for (const facing of ['SE', 'NE']) {
    await page.evaluate((id, state, facing) => window.showCustomState(id, state, facing), id, state, facing);
    await page.waitForSelector(`#custom-character-check .sprite-${state}`);
    await page.waitForFunction(() => [...document.querySelectorAll('#custom-character-check img')].length === 8 && [...document.querySelectorAll('#custom-character-check img')].every(img => img.complete && img.naturalWidth === 256));
    assert.equal(await page.$$eval('#custom-character-check img', imgs => imgs.filter(img => getComputedStyle(img).opacity === '1').length), 1, `${state}/${facing} stays visible using the idle fallback`);
    assert.ok(await page.$$eval('#custom-character-check img', imgs => imgs.every(img => getComputedStyle(img).maskImage === 'none')), 'Native PNG alpha uses no JPEG mask');
  }
  await page.evaluate(id => window.showCustomState(id, 'idle', 'SE'), id);
  await page.waitForFunction(() => Number(document.querySelector('#custom-character-check .character-sprite').dataset.frame) > 1);
  const sprite = await page.$('#custom-character-check .character-sprite');
  await sprite.screenshot({ path: `screenshots/custom/${id}.png` });
  }
  assert.deepEqual(errors, []); assert.deepEqual(missing, []);
  console.log('PASS: all custom character idle loops and stays visible in every action and direction fallback, with native alpha and no missing assets.');
} finally { await browser.close(); }
