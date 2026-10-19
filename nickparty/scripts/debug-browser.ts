import puppeteer, { type Browser, type Page } from 'puppeteer-core';

const BRAVE =
  process.env.BRAVE_PATH ?? 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
const APP_URL = process.env.APP_URL ?? 'http://localhost:5173';
const DEBUG_URL = process.env.DEBUG_URL ?? 'http://localhost:8787/debug/rooms';

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
  if (!ok) throw new Error(`no se encontró ${selector} con "${text}"`);
}

async function typeInto(page: Page, selector: string, text: string): Promise<void> {
  await page.waitForSelector(selector, { timeout: 10_000 });
  await page.click(selector);
  await page.keyboard.type(text);
}

async function main(): Promise<void> {
  const browser: Browser = await puppeteer.launch({
    executablePath: BRAVE,
    headless: true,
    args: ['--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-extensions'],
    defaultViewport: { width: 1280, height: 820 },
  });

  const a = await browser.newPage();
  a.on('console', (m) => console.log(`[A ${m.type()}]`, m.text()));
  a.on('pageerror', (e) => console.log('[A pageerror]', String(e)));
  a.on('requestfailed', (r) => console.log('[A reqfail]', r.url(), r.failure()?.errorText));

  await a.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await typeInto(a, 'input[placeholder="Escribe tu nombre"]', 'Ana');

  // Prueba directa: ¿puede el navegador abrir un WebSocket al servidor?
  const probe = await a.evaluate(
    (url) =>
      new Promise<string>((resolve) => {
        try {
          const ws = new WebSocket(url);
          const t = setTimeout(() => resolve('TIMEOUT'), 5000);
          ws.onopen = () => {
            clearTimeout(t);
            resolve('OPEN');
            ws.close();
          };
          ws.onerror = () => {
            clearTimeout(t);
            resolve('ERROR');
          };
          ws.onclose = (e) => {
            clearTimeout(t);
            resolve(`CLOSE ${e.code}`);
          };
        } catch (err) {
          resolve(`THROW ${String(err)}`);
        }
      }),
    'ws://localhost:5173/api/ws',
  );
  console.log('[probe] WebSocket desde la página ->', probe);

  await clickText(a, 'button', 'Crear sala nueva');
  await a.waitForSelector('.lobby-code', { timeout: 10_000 });
  const code = ((await a.$eval('.lobby-code', (el) => el.textContent)) ?? '').trim();
  console.log('[A] código de sala:', code);

  const b = await browser.newPage();
  b.on('console', (m) => console.log(`[B ${m.type()}]`, m.text()));
  b.on('pageerror', (e) => console.log('[B pageerror]', String(e)));
  b.on('requestfailed', (r) => console.log('[B reqfail]', r.url(), r.failure()?.errorText));
  await b.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await typeInto(b, 'input[placeholder="Escribe tu nombre"]', 'Beto');
  await typeInto(b, 'input[placeholder="ABCD"]', code);
  await clickText(b, 'button', 'Unirse');
  await b.waitForSelector('.lobby-code', { timeout: 10_000 });

  await sleep(2500);

  const rowsA = await a.$$eval('.player-row', (els) => els.map((e) => e.textContent?.trim()));
  const rowsB = await b.$$eval('.player-row', (els) => els.map((e) => e.textContent?.trim()));
  console.log('[A] jugadores vistos:', JSON.stringify(rowsA));
  console.log('[B] jugadores vistos:', JSON.stringify(rowsB));

  const dbg = await fetch(DEBUG_URL)
    .then((r) => r.text())
    .catch((e) => `no disponible: ${String(e)}`);
  console.log('[servidor] /debug/rooms ->', dbg);

  await a.screenshot({ path: 'screenshots/debug-A.png' });
  await b.screenshot({ path: 'screenshots/debug-B.png' });

  await browser.close();
}

main().catch((e) => {
  console.error('error fatal:', e);
  process.exit(1);
});
