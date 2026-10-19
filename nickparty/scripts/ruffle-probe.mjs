/**
 * Carga la página de Ruffle en Brave (vía CDP) y reporta:
 *  - qué recursos dan 4xx/5xx (el juego pide muchos assets por rutas relativas)
 *  - si el jugador dibuja algo (compara capturas en el tiempo)
 *  - errores de consola
 *
 * Uso: node nickparty/scripts/ruffle-probe.mjs [url]
 */
import puppeteer from 'puppeteer-core';
import { createHash } from 'node:crypto';

const BRAVE =
  process.env.BRAVE_PATH ?? 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
const APP_URL = process.argv[2] ?? 'http://localhost:8090/blockparty/index.html';
const OUT = 'nickparty/screenshots-ruffle';
const SECONDS = Number(process.env.SECONDS ?? 45);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (buf) => createHash('md5').update(buf).digest('hex').slice(0, 10);

const logs = [];
const errors = [];
const badResponses = [];

const browser = await puppeteer.launch({
  executablePath: BRAVE,
  headless: true,
  args: [
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
    '--enable-webgl',
    '--use-gl=swiftshader',
    '--autoplay-policy=no-user-gesture-required',
  ],
  defaultViewport: { width: 1000, height: 700 },
});

const page = await browser.newPage();
page.on('console', (m) => {
  const t = m.text();
  logs.push(`[${m.type()}] ${t}`);
  if (m.type() === 'error') errors.push(t);
});
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
page.on('response', (r) => {
  const status = r.status();
  if (status >= 400) badResponses.push(`${status} ${r.url()}`);
});
const wasmRequests = [];
page.on('request', (req) => {
  if (/\.wasm/.test(req.url())) wasmRequests.push(req.url().split('/').pop());
});;

console.log('abriendo', APP_URL);
await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });

let prev = null;
for (let i = 0; i < SECONDS / 5; i++) {
  await sleep(5000);
  await page.screenshot({ path: `${OUT}/ruffle-${String(i * 5 + 5).padStart(2, '0')}s.png` });
  const state = await page.evaluate(() => ({
    status: document.getElementById('status')?.textContent ?? null,
    ready: window.__ruffle?.ready ?? false,
    error: window.__ruffle?.error ?? null,
    players: document.querySelectorAll('ruffle-player').length,
    size: (() => {
      const p = document.querySelector('ruffle-player');
      if (!p) return null;
      const r = p.getBoundingClientRect();
      return `${Math.round(r.width)}x${Math.round(r.height)}`;
    })(),
  }));
  const el = await page.$('#container');
  let hash = 'n/a';
  if (el) {
    const shot = await el.screenshot();
    hash = md5(shot);
  }
  const changed = prev === null ? '-' : String(prev !== hash);
  prev = hash;
  console.log(`[${i * 5 + 5}s]`, JSON.stringify(state), 'render=', hash, 'cambia=', changed);

  // Con INTERACT=1 se hace clic en el centro del jugador para comprobar si el
  // juego original responde a la entrada (título -> menú).
  // Con INTERACT=2 se barre una cuadrícula de posiciones para localizar botones.
  if (process.env.INTERACT) {
    const box = await (await page.$('ruffle-player'))?.boundingBox();
    if (box) {
      if (process.env.INTERACT === '2') {
        const spots = [
          [0.5, 0.75], [0.3, 0.75], [0.7, 0.75],
          [0.5, 0.5], [0.3, 0.5], [0.7, 0.5],
          [0.5, 0.25], [0.3, 0.25], [0.7, 0.25],
        ];
        const spot = spots[i % spots.length];
        const x = box.x + box.width * spot[0];
        const y = box.y + box.height * spot[1];
        await page.mouse.click(x, y);
        console.log(`   -> clic en (${Math.round(x)}, ${Math.round(y)})`);
      } else {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.keyboard.press('Enter');
        console.log(`   -> clic en (${Math.round(box.x + box.width / 2)}, ${Math.round(box.y + box.height / 2)})`);
      }
    }
  }
}

console.log('\n--- recursos con error 4xx/5xx ({} si no hay) ---');
console.log([...new Set(badResponses)].slice(0, 20).join('\n') || '(ninguno)');
console.log('\n--- ficheros .wasm cargados ---');
console.log([...new Set(wasmRequests)].join('\n') || '(ninguno)');
console.log('\n--- errores de consola ---');
console.log(errors.slice(0, 20).join('\n') || '(ninguno)');
console.log('\n--- últimas líneas de consola ---');
console.log(logs.slice(-12).join('\n') || '(vacío)');
const { writeFileSync } = await import('node:fs');
writeFileSync(`${OUT}/console.log`, logs.join('\n'));
console.log(`\n[info] consola completa en ${OUT}/console.log (${logs.length} líneas)`);

await browser.close();
