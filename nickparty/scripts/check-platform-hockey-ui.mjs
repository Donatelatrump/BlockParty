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
      const { createArena, tickArena, arenaInput } = await import('/server/minigames.ts');
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
        window.difficultyGame = mg; if(kind==='falling'){mg.arena.players.p0.x=4; mg.arena.players.p0.alive=true; tickArena(mg,players,now+100); window.fixtureNow=now+400;}
        const render=()=>root.render(React.createElement(OriginalMinigameView,{mg,players,me:'p0',onInput:input=>{window.fixtureNow+=100; arenaInput(mg,'p0',input,Date.now()); render();}})); render();
      };
    });
    for (const kind of ['airhockey','falling']) {
      await page.evaluate(kind=>window.showDifficulty(kind,1000),kind);
      await page.waitForSelector(`.mg-${kind} .arena`);
      await new Promise(resolve=>setTimeout(resolve,300));
      if(kind==='airhockey'){
        await page.keyboard.press('ArrowRight');
        assert.equal(await page.evaluate(()=>window.difficultyGame.arena.players.p0.x),54);
        assert.equal(await page.$$eval('[data-hockey-player]',els=>els.length),8);
        assert.equal(await page.$$eval('[data-hockey-side]',els=>new Set(els.map(el=>el.dataset.hockeySide)).size),8);
        assert.ok(await page.$eval('#hockey-bar',el=>el.getBoundingClientRect().height>=44));
      } else {
        assert.equal(await page.evaluate(()=>window.difficultyGame.arena.players.p0.alive),false);
        assert.ok(await page.$eval('.arena-me',el=>parseFloat(el.style.top)>82));
      }
      await page.screenshot({path:`screenshots/difficulty/${kind}-${viewport.width}.png`});
    }
    await page.close();
  }
  console.log('PASS: eight hockey goals and visible platform fall on desktop and touch layouts');
} finally { await browser.close(); }

