import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

const browser = await puppeteer.launch({ executablePath: process.env.BRAVE_PATH ?? 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe', headless: true });
const peers = [], errors = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const base = process.env.APP_URL ?? 'http://localhost:5173';
try {
  await mkdir('screenshots/home', { recursive: true });
  const page = await browser.newPage(); page.on('pageerror', error => errors.push(String(error)));
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844, isMobile: true, hasTouch: true }, { width: 320, height: 568, isMobile: true, hasTouch: true }]) {
    await page.setViewport(viewport); await page.goto(base);
    await page.waitForSelector('.character-choice');
    assert.equal(await page.$$eval('.character-choice', elements => elements.length), await page.evaluate(async () => (await import('/shared/game.ts')).CHARACTERS.length));
    const names = await page.$$eval('.character-choice', elements => elements.map(el => el.getAttribute('aria-label')));
    for (const name of names) {
      await page.locator(`button[role="radio"][aria-label="${name}"]`).click();
      await page.waitForFunction(value => document.querySelector('.selected-character-copy h2')?.textContent === value, {}, name);
      assert.equal(await page.$$eval('[role="radio"][aria-checked="true"]', els => els.length), 1);
    }
    if (!viewport.isMobile) {
      await page.focus('[role="radio"][aria-checked="true"]');
      await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => document.querySelector('.selected-character-copy h2')?.textContent === 'Mikey');
    }
    await page.focus('input[placeholder="Escribe tu nombre"]');
    await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await page.type('input[placeholder="Escribe tu nombre"]', 'Capitana');
    await page.waitForFunction(() => [...document.querySelectorAll('.character-choice-art img, .character-podium img')].every(img => img.complete && img.naturalWidth > 0));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Home fits viewport');
    assert.ok(await page.$$eval('.character-choice', els => els.every(el => { const r = el.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; })), 'Touch targets at least 44px');
    await page.evaluate(() => window.scrollTo(0, 0)); await pause(100);
    await page.screenshot({ path: `screenshots/home/start-${viewport.width}.png`, fullPage: true });
    await page.reload(); await page.waitForSelector('.character-choice');
    assert.equal(await page.$eval('input[placeholder="Escribe tu nombre"]', el => el.value), 'Capitana', 'Name survives reload');
    assert.equal(await page.$eval('[role="radio"][aria-checked="true"]', el => el.getAttribute('aria-label')), viewport.isMobile ? names[names.length - 1] : 'Mikey', 'Character survives reload');
  }
  await page.setViewport({ width: 1440, height: 1000 }); await page.goto(base);
  await page.locator('button::-p-text(Crear sala nueva)').click(); await page.waitForSelector('.lobby-code');
  const code = await page.$eval('.lobby-code', el => el.textContent);
  const wsUrl = new URL('/api/ws', base); wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  async function join(index) {
    const ws = new WebSocket(wsUrl); peers.push(ws);
    const welcome = new Promise((resolve, reject) => { ws.on('message', raw => { const msg = JSON.parse(raw); if (msg.t === 'welcome' || msg.t === 'error') resolve(msg); }); ws.on('error', reject); });
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    ws.send(JSON.stringify({ t: 'join', room: code, sessionToken: randomUUID(), playerId: '', name: `Jugador ${index}`, avatar: ['bob','sam','cat','fanboy','skipper','sheen','tori'][index - 1] }));
    return welcome;
  }
  for (let index = 1; index < 8; index++) assert.equal((await join(index)).t, 'welcome');
  await page.waitForFunction(() => document.querySelectorAll('.player-row:not(.player-slot)').length === 8);
  assert.equal(await page.$('.player-slot'), null, 'Lobby shows eight occupied seats');
  assert.equal((await join(8)).t, 'error', 'Ninth participant is rejected');
  await page.screenshot({ path: 'screenshots/home/lobby-eight.png', fullPage: true });
  await page.locator('button::-p-text(Iniciar partida)').click();
  await page.waitForSelector('.board-tour button'); await page.click('.board-tour button');
  await page.waitForSelector('.board-roll');
  assert.equal(await page.$$eval('.board .token', els => els.length), 8, 'Board renders all eight characters');
  assert.equal(await page.$$eval('.score-list .score-row', els => els.length), 8, 'Scoreboard renders all eight players');
  await page.screenshot({ path: 'screenshots/home/board-eight.png', fullPage: true });
  await page.setViewport({ width: 320, height: 568, isMobile: true, hasTouch: true });
  await page.waitForSelector('.board'); await pause(250);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Eight-player board fits narrow mobile');
  await page.screenshot({ path: 'screenshots/home/board-eight-320.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: all registered character choices including custom characters, keyboard/touch, persistence, desktop/390/320, eight real players in lobby and board, ninth rejected.');
} finally { peers.forEach(ws => ws.terminate()); await browser.close(); }
