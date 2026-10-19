/**
 * Test E2E real en navegador (Brave/Chromium) usando CDP.
 * Abre dos pestañas, crean/entran a una sala, juegan la partida completa
 * (turnos, minijuego en tiempo real) y comprueba que el estado está sincronizado.
 *
 * Uso:  npx tsx scripts/browser-test.ts   (con `npm run dev` corriendo)
 */
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const BRAVE =
  process.env.BRAVE_PATH ?? 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
const APP_URL = process.env.APP_URL ?? 'http://localhost:5173';
const OUT = path.resolve('screenshots');
const DEADLINE_MS = 900_000;

const pageErrors: string[] = [];
const consoleErrors: string[] = [];
let failures = 0;

function check(cond: boolean, label: string): void {
  if (cond) console.log(`[browser] ✅ ${label}`);
  else {
    failures += 1;
    console.error(`[browser] ❌ ${label}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function clickText(page: Page, selector: string, text: string): Promise<void> {
  const ok = await page.evaluate(
    (sel, txt) => {
      const els = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
      const el = els.find((e) => (e.textContent ?? '').trim().includes(txt));
      if (!el) return false;
      el.click();
      return true;
    },
    selector,
    text,
  );
  if (!ok) throw new Error(`no se encontró ${selector} con texto "${text}"`);
}

async function typeInto(page: Page, selector: string, text: string): Promise<void> {
  await page.waitForSelector(selector, { timeout: 10_000 });
  // Triple clic selecciona el contenido previo (el nombre se recuerda en localStorage).
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.type(text);
}

async function newPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[placeholder="Escribe tu nombre"]', { timeout: 20_000 });
  return page;
}

async function tryRoll(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
    const b = btns.find((x) => (x.textContent ?? '').trim() === 'Tirar dado');
    if (b && !b.disabled) {
      b.click();
      return true;
    }
    return false;
  });
}

/**
 * Clic real de ratón sobre las monedas. Se usan coordenadas (no ElementHandle.click)
 * porque las monedas se re-renderizan constantemente y el handle puede colgarse.
 * El handler de la app escucha `pointerdown`, así que hace falta input real.
 */
async function clickCoins(page: Page, max = 3): Promise<void> {
  const size = page.viewport() ?? { width: 1280, height: 820 };
  const boxes = await page.$$eval('.mg-coin:not(:disabled)', (els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
    }),
  );
  const usable = boxes
    .filter((b) => b.w > 0 && b.x > 0 && b.y > 0 && b.x < size.width && b.y < size.height)
    .slice(0, max);
  for (const b of usable) {
    try {
      await page.mouse.click(b.x, b.y);
    } catch {
      /* la moneda pudo desaparecer entre el selector y el clic */
    }
  }
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  if (!fs.existsSync(BRAVE)) throw new Error(`No se encontró Brave en ${BRAVE}`);

  const browser = await puppeteer.launch({
    userDataDir: path.resolve('.browser-profile'),
    executablePath: BRAVE,
    headless: true,
    args: ['--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-extensions'],
    defaultViewport: { width: 1280, height: 820 },
  });

  try {
    // --- 1. crea la sala -------------------------------------------------
    const anna = await newPage(browser);
    const cdpA = await anna.createCDPSession();
    await cdpA.send('Network.enable');
    cdpA.on('Network.webSocketCreated', (e: { url?: string }) => console.log('[A ws+]', e.url));
    cdpA.on('Network.webSocketClosed', () => console.log('[A ws-] cerrada'));
    await typeInto(anna, 'input[placeholder="Escribe tu nombre"]', 'Ana');
    await clickText(anna, 'button', 'Crear sala nueva');
    await anna.waitForSelector('.lobby-code', { timeout: 10_000 });
    const code = ((await anna.$eval('.lobby-code', (el) => el.textContent)) ?? '').trim();
    check(/^[A-Z0-9]{4}$/.test(code), `sala creada con código ${code}`);
    await anna.screenshot({ path: path.join(OUT, '01-lobby-anfitrion.png') });
    console.log(`[browser] abre ${APP_URL}/?sala=${code} en otra pestaña para invitar`);

    // --- 2. se une el segundo jugador ------------------------------------
    const beto = await newPage(browser);
    await typeInto(beto, 'input[placeholder="Escribe tu nombre"]', 'Beto');
    await typeInto(beto, 'input[placeholder="ABCD"]', code);
    await clickText(beto, 'button', 'Unirse');
    await beto.waitForSelector('.lobby-code', { timeout: 10_000 });
    const codeB = ((await beto.$eval('.lobby-code', (el) => el.textContent)) ?? '').trim();
    check(codeB === code, `el invitado ve la misma sala (${codeB})`);

    await anna.waitForFunction(() => document.querySelectorAll('.player-row').length === 2, {
      timeout: 10_000,
    });
    check(true, 'el anfitrión ve a los 2 jugadores en el lobby');
    check(
      (await beto.$$eval('.player-row', (els) => els.length)) === 2,
      'el invitado ve a los 2 jugadores en el lobby',
    );
    await beto.screenshot({ path: path.join(OUT, '02-lobby-invitado.png') });

    // --- 3. arranca la partida -------------------------------------------
    await clickText(anna, '.round-btn', '4 rondas');
    await clickText(anna, 'button', 'Iniciar partida');
    await anna.waitForSelector('.board', { timeout: 10_000 });
    await beto.waitForSelector('.board', { timeout: 10_000 });
    check(true, 'ambos navegadores entraron a la partida');

    const tiles = await anna.$$eval('.tile', (els) => els.length);
    check(tiles === 45, `el tablero pinta 45 casillas (${tiles})`);
    check((await anna.$$eval('.token', (els) => els.length)) === 2, 'hay 2 fichas en el tablero');
    await anna.screenshot({ path: path.join(OUT, '03-tablero.png') });

    // --- 4. juega hasta el final -----------------------------------------
    const deadline = Date.now() + DEADLINE_MS;
    let rolls = 0;
    let miniGames = 0;
    let inMinigame = false;
    let sawEnd = false;
    let lastTick = 0;

    const snapshot = (page: Page) =>
      page.evaluate(() => ({
        phase: document.querySelector('.mg-overlay')
          ? 'minigame'
          : document.querySelector('.end-overlay')
            ? 'ended'
            : 'playing',
        die: document.querySelector('.die')?.textContent ?? null,
        banner: document.querySelector('.turn-banner')?.textContent?.trim() ?? null,
        meSet: !!document.querySelector('.score-row.score-me'),
        round: document.querySelector('.board-round')?.textContent ?? null,
        lastLog: Array.from(document.querySelectorAll('.log-list li'))[0]?.textContent ?? null,
      }));

    while (Date.now() < deadline) {
      if (Date.now() - lastTick > 2500) {
        lastTick = Date.now();
        console.log(`[tick ${Math.round((Date.now() - (deadline - DEADLINE_MS)) / 1000)}s] A=${JSON.stringify(await snapshot(anna))}`);
      }

      if (await anna.$('.end-overlay')) {
        sawEnd = true;
        break;
      }

      for (const page of [anna, beto]) {
        await page.evaluate(() => {
          const path = document.querySelector<HTMLButtonElement>('.path-choice:not(:disabled)');
          if (path) { path.click(); return; }
          const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.shop-overlay button:not(:disabled), .trivia-answers button:not(:disabled)'));
          const action = buttons.find((b) => /Terminar compra|Dejarla/.test(b.textContent ?? '')) ?? buttons.find((b) => b.closest('.trivia-answers'));
          action?.click();
          document.querySelector<HTMLButtonElement>('.mg-card:not(:disabled)')?.click();
        });
      }
      if (await anna.$('.original-mg')) {
        if (!inMinigame) {
          inMinigame = true;
          miniGames += 1;
          await sleep(300);
          await anna.screenshot({ path: path.join(OUT, `04-minijuego-${miniGames}.png`) });
        }
        await clickCoins(anna, 3);
        await clickCoins(beto, 3);
        for (const page of [anna, beto]) await page.evaluate(() => {
          const field = document.querySelector('.original-mg .arena');
          if (!field) return;
          const flea = field.querySelector<HTMLButtonElement>('.arena-flea:not(:disabled)');
          if (flea) {
            flea.click();
            const color = flea.getAttribute('aria-label')?.replace('Pulga ', '');
            Array.from(field.querySelectorAll<HTMLButtonElement>('.flea-buckets button')).find(button => button.textContent?.includes(color ?? '---'))?.click();
            return;
          }
          if (field.querySelector('.goat')) {
            const request = field.querySelector('.goat-request')?.textContent?.toLowerCase() ?? '';
            Array.from(field.querySelectorAll<HTMLButtonElement>('.goat-food button')).find(button => request.includes(button.textContent?.trim().split(' ').pop()?.toLowerCase() ?? '---'))?.click();
            field.querySelector<HTMLButtonElement>('.goat')?.click();
            return;
          }
          const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.original-mg .arena-controls button:not(:disabled), .simon-pad button:not(:disabled), .arena-jelly:not(:disabled), .locker-rows button:not(:disabled)'));
          buttons[Math.floor(Math.random() * buttons.length)]?.click();
        });
        await sleep(50);
        continue;
      }

      if (inMinigame) {
        inMinigame = false;
        // Verifica que el marcador del minijuego quedó sincronizado.
        let synced = false;
        for (let i = 0; i < 40 && !synced; i++) {
          const sa = await anna.$$eval('.score-coins', (els) => els.map((e) => e.textContent));
          const sb = await beto.$$eval('.score-coins', (els) => els.map((e) => e.textContent));
          synced = JSON.stringify(sa) === JSON.stringify(sb);
          if (!synced) await sleep(120);
        }
        check(synced, `los marcadores coinciden tras el minijuego ${miniGames}`);
      }

      const rolled = (await tryRoll(anna)) || (await tryRoll(beto));
      if (rolled) rolls += 1;
      await sleep(120);
    }

    console.log(`[tick final] A=${JSON.stringify(await snapshot(anna))} B=${JSON.stringify(await snapshot(beto))}`);
    const debugUrl = process.env.DEBUG_URL;
    if (debugUrl) {
      const dbg = await fetch(debugUrl)
        .then((r) => r.text())
        .catch((e) => `no disponible: ${String(e)}`);
      console.log('[servidor] /debug/rooms ->', dbg);
    }

    check(rolls > 0, `se ejecutaron turnos reales (${rolls} tiradas)`);
    check(miniGames > 0, `se jugó el minijuego en tiempo real (${miniGames} veces)`);

    if (!sawEnd) {
      // Da un margen extra para el cierre de la última ronda.
      try {
        await anna.waitForSelector('.end-overlay', { timeout: 30_000 });
        sawEnd = true;
      } catch {
        sawEnd = false;
      }
    }
    check(sawEnd, 'la partida llegó a la pantalla final');

    if (sawEnd) {
      const winnerA = ((await anna.$eval('.end-winner', (el) => el.textContent)) ?? '').trim();
      const winnerB = ((await beto.$eval('.end-winner', (el) => el.textContent)) ?? '').trim();
      check(winnerA.length > 0, `se anunció un ganador: ${winnerA}`);
      check(winnerA === winnerB, 'ambos navegadores coinciden en el ganador');
      await anna.screenshot({ path: path.join(OUT, '05-final.png') });
    }

    // --- 5. errores de consola -------------------------------------------
    check(pageErrors.length === 0, `sin excepciones en el navegador (${pageErrors.length})`);
    const relevantConsole = consoleErrors.filter(
      (e) => !/favicon|DevTools|source map|Download the React DevTools/i.test(e),
    );
    if (relevantConsole.length) {
      console.warn('[browser] errores de consola:');
      for (const e of relevantConsole) console.warn('   -', e);
    }
    check(relevantConsole.length === 0, `sin errores de consola relevantes (${relevantConsole.length})`);
  } finally {
    await browser.close();
  }
}

main()
  .then(() => {
    if (failures) {
      console.error(`[browser] falló con ${failures} comprobación(es)`);
      process.exit(1);
    }
    console.log(`[browser] 🎉 OK · capturas en ${OUT}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('[browser] error fatal:', err);
    process.exit(1);
  });
