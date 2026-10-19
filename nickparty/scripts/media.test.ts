import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';

test('all character timelines resolve to original JPEGs and nonempty PNG alpha masks', () => {
  const root = resolve(import.meta.dirname, '../..');
  const manifest = JSON.parse(readFileSync(resolve(root, 'shared/original-character-sprites.json'), 'utf8')) as Record<string, Record<string, Array<{ file: string }>>>;
  assert.equal(Object.keys(manifest).length, 8);
  const checked = new Set<string>();
  for (const states of Object.values(manifest)) {
    for (const state of ['idlingSE', 'winFront', 'looseFront']) assert.ok(states[state]?.length);
    assert.ok(Object.keys(states).some(key => key.startsWith('running')));
    for (const frames of Object.values(states)) for (const frame of frames) {
      if (checked.has(frame.file)) continue; checked.add(frame.file);
      const file = resolve(root, 'public/assets/sprites', frame.file);
      const jpg = readFileSync(file); assert.equal(jpg[0], 255); assert.equal(jpg[1], 216);
      const png = readFileSync(file.replace('.jpg', '.mask.png')); assert.equal(png.subarray(1, 4).toString(), 'PNG');
      const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
      let offset = 8; const compressed: Buffer[] = [];
      while (offset < png.length) { const length = png.readUInt32BE(offset); if (png.subarray(offset + 4, offset + 8).toString() === 'IDAT') compressed.push(png.subarray(offset + 8, offset + 8 + length)); offset += length + 12; }
      const pixels = inflateSync(Buffer.concat(compressed)); assert.equal(pixels.length, (width * 4 + 1) * height);
      let visible = 0, transparent = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const alpha = pixels[y * (width * 4 + 1) + 1 + x * 4 + 3]; if (alpha) visible++; if (!alpha) transparent++; }
      assert.ok(visible > 0 && transparent > 0, frame.file);
    }
  }
  assert.equal(checked.size, 589);
  for (const theme of ['bob', 'fanboy', 'icarly', 'madagascar', 'samAndCat', 'sheen', 'tmnt', 'tuffPuppy', 'victorious']) assert.ok(existsSync(resolve(root, `public/assets/audio/${theme}.mp3`)));
});
