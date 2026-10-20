import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser = await puppeteer.launch({
  executablePath: process.env.BRAVE_PATH ?? 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: true,
  defaultViewport: { width: 1440, height: 1000 },
});
const page = await browser.newPage();
const errors = [];
const missingAssets = [];
page.on('response', response => { if (response.status() >= 400 && response.url().includes('/assets/')) missingAssets.push(response.url()); });
page.on('pageerror', error => errors.push(error.stack ?? String(error)));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await mkdir('screenshots/gameplay', { recursive: true });
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173');
  await page.type('input[placeholder="Escribe tu nombre"]', 'Prueba');
  await page.locator('button::-p-text(Crear sala nueva)').click();
  await page.waitForSelector('.cpu-toggle input');
  await page.click('.cpu-toggle input');
  await page.locator('button.btn-primary::-p-text(Jugar contra CPU)').click();
  await page.waitForSelector('.board-tour button');
  await page.click('.board-tour button');
  await page.waitForSelector('.board-roll', { timeout: 20000 });
  assert.equal(await page.$('.game-side .dice-panel'), null);
  assert.ok(await page.$('.board-stage .board-roll'));
  assert.equal(await page.$eval('.score-coins .coin-balance', el => el.getAttribute('aria-label')), '10 monedas');
  const scale = await page.evaluate(() => { const board = document.querySelector('.board').getBoundingClientRect(); const actor = document.querySelector('.token .character-sprite').getBoundingClientRect(); return actor.height / board.width; });
  assert.ok(scale < .03, 'Characters occupy less than 3% of map width');
  await page.screenshot({ path: 'screenshots/gameplay/board.png' });
  await page.click('.board-roll');
  await page.waitForSelector('.dice-throw');
  await page.screenshot({ path: 'screenshots/gameplay/dice.png' });

  await page.locator('button::-p-text(Salir de la partida)').click();

  // Exercise the actual minigame component and authoritative input reducer in
  // an isolated render so every game can be checked without waiting 18 rounds.
  const installFixture = async () => page.evaluate(async () => {
    window.disposeFixture?.();
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { OriginalMinigameView } = await import('/src/OriginalMinigame.tsx');
    const { CoinBalance, CoinBurst, useCoinChanges } = await import('/src/Coins.tsx');
    const { MINIGAMES } = await import('/shared/minigames.ts');
    const { CHARACTERS, COLORS } = await import('/shared/game.ts');
    const { createArena, arenaInput, tickArena } = await import('/server/minigames.ts');
    document.querySelector('#root').style.display = 'none';
    const host = document.createElement('div'); document.body.append(host);
    const root = ReactDOM.createRoot(host);
    const players = [...CHARACTERS.slice(0, 7), CHARACTERS[CHARACTERS.length - 1]].map(({ id: avatar }, i) => ({ id: `p${i}`, connected: true, avatar, name: i ? `CPU ${i}` : 'Prueba', color: COLORS[i] }));
    let timer;
    window.disposeFixture = () => { clearInterval(timer); root.unmount(); host.remove(); };
    window.showMini = (kind, delay = -1000) => {
      clearInterval(timer);
      const def = MINIGAMES.find(d => d.id === kind);
      const startsAt = Date.now() + delay;
      const mg = { ...def, id: Math.random(), kind, startsAt, endsAt: startsAt + 60000, collected: {}, arena: createArena(players.map(p => p.id), kind, startsAt) };
      window.uiMini = mg; window.uiInputs = [];
      const render = () => root.render(React.createElement(OriginalMinigameView, { mg, players, me: 'p0', onInput: input => { window.uiInputs.push(input); arenaInput(mg, 'p0', input, Date.now()); render(); } }));
      window.renderMini = render;
      timer = setInterval(() => { if (window.runSimulation) { tickArena(mg, players, Date.now()); render(); } }, 50);
      render();
    };
    function CoinFixture({ balance, gold }) {
      const changes = useCoinChanges([{ id: 'p0', coins: balance, gold }], 'coin-test');
      return React.createElement('div', { className: 'coin-test', style: { position: 'absolute', left: '50%', top: '50%' } },
        React.createElement(CoinBalance, { value: balance }), React.createElement(CoinBalance, { value: gold, gold: true }),
        changes.flatMap(change => [change.coins && React.createElement(CoinBurst, { key: change.id+'blue', amount: change.coins }), change.gold && React.createElement(CoinBurst, { key: change.id+'gold', amount: change.gold, gold: true })]));
    }
    window.showCoins = (balance, gold = 0) => { clearInterval(timer); root.render(React.createElement(CoinFixture, { balance, gold })); };
    window.miniKinds = MINIGAMES.map(d => d.id);
  });
  await installFixture();
  await page.evaluate(() => window.showMini('paint', 800));
  await pause(100);
  await page.keyboard.down('d');
  await pause(1100);
  await page.keyboard.up('d');
  assert.ok(await page.evaluate(() => window.uiMini.arena.players.p0.x > 15), 'Held WASD crosses countdown and moves player');
  await pause(100);
  await page.keyboard.press('ArrowDown');
  assert.ok(await page.evaluate(() => window.uiMini.arena.players.p0.y > 20), 'Arrow key moves player');
  await pause(150);
  await page.keyboard.press('w');
  assert.ok(await page.evaluate(() => window.uiInputs.some(i => i.key === 'up')), 'W maps to up');
  await pause(100);
  await page.keyboard.down('d');
  await page.keyboard.down('s');
  await pause(450);
  await page.keyboard.up('d');
  await page.keyboard.up('s');
  assert.ok(await page.evaluate(() => window.uiInputs.filter(i => i.key === 'down').length > 1), 'Two held axes both reach server');
  const beforeBlur = await page.evaluate(() => window.uiInputs.length);
  await page.keyboard.down('a');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await pause(220);
  await page.keyboard.up('a');
  assert.ok(await page.evaluate(() => window.uiInputs.length) <= beforeBlur + 1, 'Blur releases held movement');
  await page.evaluate(() => window.showMini('jumper'));
  await pause(100);
  await page.keyboard.press('Space');
  assert.ok(await page.evaluate(() => window.uiMini.arena.players.p0.jumpUntil > Date.now()), 'Space jumps');
  await page.evaluate(() => window.showMini('pizza_pursuit'));
  await pause(200);
  await page.waitForSelector('.mg-pizza_pursuit');
  await pause(200);
  const ground = await page.$eval('.arena-me', el => el.getBoundingClientRect().top);
  await page.keyboard.press('Space');
  await pause(380);
  const lifted = await page.evaluate(() => { const anchor = document.querySelector('.arena-me').getBoundingClientRect(); const lift = document.querySelector('.arena-me .arena-lift').getBoundingClientRect(); return { ground: anchor.top, lift: lift.top, height: Number(document.querySelector('.arena-me .arena-lift').dataset.jumpHeight) }; });
  assert.ok(lifted.height > 14 && lifted.ground - lifted.lift > 40, 'Jump physically lifts the character above its grounded shadow');
  assert.ok(Math.abs(lifted.ground - ground) < 1, `Shadow stays on the ground: ${JSON.stringify({ground, lifted})}`);
  const risingPose = await page.$eval('.arena-me .character-sprite', el => Number(el.dataset.frame));
  assert.ok(risingPose >= 4, 'Jump pose follows the flight instead of restarting halfway through');
  await page.screenshot({ path: 'screenshots/gameplay/sewer-jump.png' });

  await pause(500);
  assert.equal(await page.$eval('.arena-me .arena-lift', el => Number(el.dataset.jumpHeight)), 0, 'Jump lands');
  const kinds = await page.evaluate(() => window.miniKinds);
  for (const kind of kinds) {
    await page.evaluate(k => window.showMini(k), kind);
    await page.waitForSelector(`.mg-${kind} .arena`);
    await page.waitForFunction(() => { const r = document.querySelector('.arena').getBoundingClientRect(); return r.height >= 200 && r.bottom < innerHeight; });
    await pause(180);
    assert.ok(await page.evaluate(() => { const r = document.querySelector('.arena').getBoundingClientRect(); return r.height >= 200 && r.bottom < innerHeight; }), `${kind} fits screen`);
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('.mg-scores .mini-avatar')].every(el => el.getBoundingClientRect().width <= 24 && el.getBoundingClientRect().height <= 24)), `${kind} portraits remain bounded`);
    assert.ok(await page.evaluate(() => document.querySelector('.mg-scores').getBoundingClientRect().bottom <= innerHeight), `${kind} scoreboard fits screen`);
    await page.screenshot({ path: `screenshots/gameplay/${kind}.png` });
  }
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewport({ ...viewport, isMobile: true, hasTouch: true });
    await installFixture();
    for (const kind of kinds) {
      await page.evaluate(k => window.showMini(k), kind);
      await page.waitForSelector(`.mg-${kind} .arena`);
      await pause(250);
      await page.waitForSelector(`.mg-${kind} .mg-scores`);
      const layout = await page.evaluate(() => {
        const arena = document.querySelector('.arena').getBoundingClientRect();
        const scores = document.querySelector('.mg-scores').getBoundingClientRect();
        const buttons = [...document.querySelectorAll('.arena-controls button, .arena-flea, .flea-buckets button, .locker-bank button, .goat-food button, .arena-jelly, .simon-pad button')];
        return { fits: arena.top >= 0 && arena.bottom <= innerHeight && scores.bottom <= innerHeight + 1, overflow: document.documentElement.scrollWidth > innerWidth, small: buttons.filter(el => { const r = el.getBoundingClientRect(); return r.width < 43.9 || r.height < 43.9; }).map(el => el.className), broken: [...document.querySelectorAll('.original-mg img')].filter(img => img.complete && !img.naturalWidth).map(img => img.src) };
      });
      assert.ok(layout.fits && !layout.overflow, `${kind} fits ${viewport.width}: ${JSON.stringify(layout)}`);
      assert.deepEqual(layout.small, [], `${kind}: touch targets at least 44px`);
      assert.deepEqual(layout.broken, [], `${kind}: images load`);
      await page.screenshot({ path: `screenshots/gameplay/${kind}-${viewport.width}.png` });
    }
    await page.evaluate(() => window.showMini('paint'));
    await pause(200);
    const right = await page.$('.control-right');
    const box = await right.boundingBox();
    const client = await page.createCDPSession();
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
    const x = await page.evaluate(() => window.uiMini.arena.players.p0.x);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await pause(350);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const after = await page.evaluate(() => window.uiMini.arena.players.p0.x);
    assert.ok(after > x, 'Native touch hold moves player');
    await pause(200);
    assert.equal(await page.evaluate(() => window.uiMini.arena.players.p0.x), after, 'Touch release stops movement');
    await page.evaluate(() => window.showMini('escapeyo'));
    await pause(150);
    const points = await page.evaluate(() => ['.control-right', '.mini-action'].map((selector, id) => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x+r.width/2, y: r.y+r.height/2, id: id+1 }; }));
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
    assert.ok(await page.evaluate(() => window.uiMini.arena.players.p0.jumpUntil > Date.now() && window.uiMini.arena.players.p0.progress > 0), 'Two fingers move and jump together');
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await client.detach();
    await page.evaluate(() => window.showMini('fleas'));
    await pause(150);
    await page.tap('.arena-flea');
    await page.tap('[data-drop="0"]');
    assert.equal(await page.evaluate(() => window.uiMini.arena.players.p0.score), 1, 'Touch selects flea and bucket');
    await page.evaluate(() => window.showMini('demanding_goat'));
    await pause(150);
    await page.tap('.goat-food button');
    await page.tap('.goat');
    assert.equal(await page.evaluate(() => window.uiMini.arena.players.p0.score), 1, 'Touch feeds requested food');
    await page.evaluate(() => window.showMini('lockers'));
    await pause(150);
    await page.tap('.locker-bank button');
    assert.equal(await page.evaluate(() => window.uiMini.arena.players.p0.score), 1, 'Touch closes own locker');
    await page.evaluate(() => { window.showMini('dodge'); window.runSimulation = true; });
    await pause(200);
    await page.tap('.arena-jelly');
    assert.equal(await page.evaluate(() => window.uiMini.arena.players.p0.score), 1, 'Touch catches moving jellyfish');
    await page.evaluate(() => { window.runSimulation = false; window.uiMini.resultsUntil = Date.now()+5000; window.uiMini.rewards = { p0: 10 }; window.renderMini(); });
    await page.waitForSelector('.mg-results .coin-burst');
    await page.screenshot({ path: `screenshots/gameplay/results-${viewport.width}.png` });
    await page.evaluate(() => window.showMini('paint', 8000));
    await page.waitForSelector('.mg-instructions');
    await page.screenshot({ path: `screenshots/gameplay/instructions-${viewport.width}.png` });
  }
  await page.evaluate(() => window.showCoins(10));
  await page.waitForSelector('.coin-test');
  assert.equal(await page.$('.coin-burst'), null, 'Initial balance does not replay a reward');
  await page.evaluate(() => window.showCoins(15));
  await page.waitForSelector('.coin-burst[aria-label="+5 monedas"]');
  await pause(750);
  assert.equal(await page.$eval('.coin-balance span[aria-hidden=true]:last-child', el => el.textContent), '15', 'Counter reaches authoritative balance');
  await page.screenshot({ path: 'screenshots/gameplay/coins-gain.png' });
  await page.evaluate(() => window.showCoins(10, 1));
  await page.waitForSelector('.coin-loss[aria-label="-5 monedas"]');
  await page.waitForSelector('.coin-burst[aria-label="+1 monedas doradas"]');
  await pause(2300);
  assert.equal(await page.$('.coin-burst'), null, 'Coin particles expire');
  await page.evaluate(() => window.showCoins(10, 1));
  await pause(100);
  assert.equal(await page.$('.coin-burst'), null, 'Repeated state does not replay coins');
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.evaluate(() => window.showCoins(25, 1));
  await pause(100);
  assert.equal(await page.$eval('.coin-sprite', el => getComputedStyle(el).animationName), 'none', 'Reduced motion disables coin rotation');
  assert.deepEqual(missingAssets, []);
  assert.deepEqual(errors, []);
  console.log('PASS: in-board dice, WASD across countdown, arrows, Space, all catalog scenes with 8 players at desktop / 390 / 320 / landscape, native touch, simultaneous jump, rewards; no browser exceptions.');
} catch (error) {
  await page.screenshot({ path: 'screenshots/gameplay/failure.png' });
  console.error(await page.evaluate(() => document.body.innerText));
  throw error;
} finally {
  await browser.close();
}
