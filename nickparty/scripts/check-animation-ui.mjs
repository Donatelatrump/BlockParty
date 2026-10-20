import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const browser = await puppeteer.launch({ executablePath: process.env.BRAVE_PATH ?? 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe', headless: true, defaultViewport: { width: 1440, height: 900 } });
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(process.env.APP_URL ?? 'http://localhost:5173');
  await page.evaluate(async () => {
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { CharacterSprite } = await import('/src/CharacterSprite.tsx');
    const { CHARACTERS } = await import('/shared/game.ts');
    document.querySelector('#root').style.display = 'none';
    const host = document.createElement('div'); document.body.append(host);
    ReactDOM.createRoot(host).render(React.createElement('div', { id: 'animation-gallery', 'data-count': CHARACTERS.length, style: { display: 'grid', gridTemplateColumns: `repeat(${CHARACTERS.length}, 160px)`, width: CHARACTERS.length * 160, height: 180, background: '#ff00ff' } },
      CHARACTERS.map(character => React.createElement('div', { key: character.id, style: { display: 'grid', placeItems: 'center', width: 160, height: 180, '--portrait-height': '110px' } }, React.createElement(CharacterSprite, { id: character.id, portrait: true, label: character.name })))));
  });
  await page.waitForFunction(() => document.querySelectorAll('#animation-gallery .character-sprite').length === Number(document.querySelector('#animation-gallery').dataset.count) && [...document.querySelectorAll('#animation-gallery img')].every(img => img.complete && img.naturalWidth > 0));
  await page.waitForFunction(() => Number(document.querySelector('#animation-gallery [aria-label="Fanboy"]').dataset.frame) > 1);
  await mkdir('screenshots/animation', { recursive: true });
  const gallery = await page.$('#animation-gallery');
  let wraps = 0, last = -1;
  for (let index = 0; index < 72; index++) {
    const frame = await page.$eval('#animation-gallery [aria-label="Fanboy"]', el => Number(el.dataset.frame));
    if (frame < last) wraps++; last = frame;
    assert.ok(await page.$$eval('#animation-gallery .character-sprite', sprites => sprites.every(sprite => [...sprite.querySelectorAll('img')].filter(img => getComputedStyle(img).opacity === '1').length === 1)), 'Exactly one decoded layer stays visible');
    await gallery.screenshot({ path: `screenshots/animation/frame-${index}.png` });
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.ok(wraps >= 2, 'Observed multiple complete animation loops');
  const output = execFileSync('python', ['-c', `
from pathlib import Path
from PIL import Image
files=list(Path('screenshots/animation').glob('frame-*.png'))
for path in files:
 im=Image.open(path).convert('RGB')
 for index in range(im.width // 160):
  cell=im.crop((index*160,0,(index+1)*160,180))
  visible=sum(1 for r,g,b in cell.getdata() if g>30 or r<220 or b<220)
  assert visible>350, f'{path.name}: character {index} disappeared ({visible} pixels)'
print(f'PASS: {len(files)} screenshots x {im.width // 160} characters remain visible across animation loops.')
`], { encoding: 'utf8' });
  assert.deepEqual(errors, []); console.log(output.trim());
} finally { await browser.close(); }
