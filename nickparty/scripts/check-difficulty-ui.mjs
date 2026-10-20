import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser = await puppeteer.launch({ executablePath: process.env.BRAVE_PATH ?? 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe', headless: true });
try {
  await mkdir('screenshots/difficulty', { recursive: true });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844, isMobile: true, hasTouch: true }]) {
    const page = await browser.newPage(); await page.setViewport(viewport);
    await page.goto(process.env.APP_URL ?? 'http://localhost:5173');
    await page.evaluate(async () => {
      const { default: React } = await import('/node_modules/.vite/deps/react.js');
      const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
      const { OriginalMinigameView } = await import('/src/OriginalMinigame.tsx');
      const { MINIGAMES } = await import('/shared/minigames.ts');
      const { CHARACTERS, COLORS } = await import('/shared/game.ts');
      const { createArena, tickArena } = await import('/server/minigames.ts');
      const clock = Date.now; window.fixtureNow = clock(); Date.now = () => window.fixtureNow;
      document.querySelector('#root').style.display = 'none';
      const host = document.createElement('div'); document.body.append(host); const root = ReactDOM.createRoot(host);
      const players = [...CHARACTERS.slice(0,7), CHARACTERS[CHARACTERS.length-1]].map((c,i) => ({ id: `p${i}`, avatar: c.id, connected: true, name: c.name, color: COLORS[i] }));
      window.showDifficulty = (kind, elapsed) => {
        window.fixtureNow = clock(); const now = Date.now();
        const def = MINIGAMES.find(g => g.id === kind);
        const mg = { ...def, id: Math.random(), kind, startsAt: now-elapsed, endsAt: now+40000, collected: {}, arena: createArena(players.map(p=>p.id),kind,now-elapsed) };
        tickArena(mg,players,now);
        Object.values(mg.arena.players).forEach(p => { p.alive=true; p.lives=3; p.feedback=undefined; p.progress=100; if(['jumper','pizza_pursuit','escapeyo','coin_scramble'].includes(kind))p.jumpUntil=now+325; });
        window.difficultyGame = mg;
        root.render(React.createElement(OriginalMinigameView,{mg,players,me:'p0',onInput:()=>{}}));
      };
    });
    for (const kind of ['jumper','pizza_pursuit','escapeyo','bouncybed']) {
      await page.evaluate(kind => window.showDifficulty(kind,kind==='bouncybed'?500:19000),kind);
      await page.waitForSelector(`.mg-${kind} .arena`);
      await page.waitForFunction(() => [...document.querySelectorAll('.arena .character-sprite img')].every(img=>img.complete&&img.naturalWidth));
      await new Promise(resolve=>setTimeout(resolve,200));
      const layout = await page.evaluate(() => {
        const arena = document.querySelector('.arena').getBoundingClientRect();
        const actors = [...document.querySelectorAll('.arena-player .character-sprite')].map(el=>{const r=el.getBoundingClientRect();return{top:r.top,bottom:r.bottom};});
        const local = document.querySelector('.arena-me .character-sprite').getBoundingClientRect();
        const rivals = [...document.querySelectorAll('.arena-player:not(.arena-me) .character-sprite')].map(el=>el.getBoundingClientRect().bottom);
        return {contained:actors.every(r=>r.top>=arena.top&&r.bottom<=arena.bottom), separated:local.top>Math.max(...rivals)};
      });
      assert.ok(layout.contained, `${kind}: peak jump remains inside ${viewport.width}px arena`);
      if(kind==='pizza_pursuit'||kind==='escapeyo')assert.ok(layout.separated, 'Local airborne character does not overlap rival lanes');
      await page.screenshot({path:`screenshots/difficulty/${kind}-${viewport.width}.png`});
    }
    const extensions=[];
    for (const elapsed of [1000,2400,2650,3000,23000]) {
      await page.evaluate(elapsed=>{window.showDifficulty('escape',elapsed);},elapsed);
      await page.waitForSelector('.oom-attack');
      await new Promise(resolve=>setTimeout(resolve,120));
      extensions.push(await page.$eval('.oom-attack',el=>Number(el.dataset.oomExtension)));
      await page.screenshot({path:`screenshots/difficulty/oom-${elapsed}-${viewport.width}.png`});
    }
    assert.equal(extensions[0],0);assert.ok(extensions[1]>0&&extensions[1]<1);assert.equal(extensions[2],1);assert.ok(extensions[3]<1);
    const counts=[];
    for (const elapsed of [1000,18000]) {
      await page.evaluate(elapsed=>window.showDifficulty('dodge',elapsed),elapsed);
      await page.waitForSelector('.mg-dodge'); await new Promise(resolve=>setTimeout(resolve,100));
      counts.push(await page.$$eval('.arena-jelly',els=>els.length));
      await page.screenshot({path:`screenshots/difficulty/jelly-${elapsed}-${viewport.width}.png`});
    }
    assert.ok(counts[1]>counts[0], 'Late jelly waves put more targets on screen');
    await page.close();
  }
  console.log('PASS: peak jumps stay on-screen, runner lanes stay separate, jelly density increases on desktop and mobile with eight players.');
} finally { await browser.close(); }
