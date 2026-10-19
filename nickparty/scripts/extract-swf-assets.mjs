/**
 * Extrae los mapas de bits embebidos en un .SWF (DefineBitsJPEG2 / JPEG3) a
 * ficheros sueltos. Es la vía para reutilizar el arte original en una versión
 * HTML5 en vez de dibujar bloques con emoji.
 *
 * Uso: node nickparty/scripts/extract-swf-assets.mjs <ruta.swf> <carpetaSalida>
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { extname, basename, dirname, join } from 'node:path';
import { inflateSync } from 'node:zlib';

function swfBody(buf) {
  const magic = buf.subarray(0, 3).toString('latin1');
  if (magic === 'CWS') return inflateSync(buf.subarray(8));
  if (magic === 'FWS') return buf.subarray(8);
  throw new Error(`header no soportado: ${magic}`);
}

/** Salta el RECT del frame size y los 4 bytes de frameRate/frameCount. */
function skipHeader(body) {
  const first = body[0];
  const nbits = first >> 3;
  const rectBits = 5 + nbits * 4;
  const rectBytes = Math.ceil(rectBits / 8);
  return rectBytes + 4; // +2 frameRate +2 frameCount
}

function extract(swfPath, outDir) {
  const buf = readFileSync(swfPath);
  const body = swfBody(buf);
  let pos = skipHeader(body);

  mkdirSync(outDir, { recursive: true });
  const found = [];
  const counts = {};

  while (pos + 2 <= body.length) {
    const header = body.readUInt16LE(pos);
    pos += 2;
    const code = header >> 6;
    let len = header & 0x3f;
    if (len === 0x3f) {
      if (pos + 4 > body.length) break;
      len = body.readUInt32LE(pos);
      pos += 4;
    }
    const end = pos + len;
    if (end > body.length) break;

    // 21 = DefineBitsJPEG2, 35 = DefineBitsJPEG3
    if (code === 21 || code === 35) {
      const charId = body.readUInt16LE(pos);
      let start = pos + 2;
      if (code === 35) {
        const alphaOffset = body.readUInt32LE(pos + 2);
        start = pos + 6;
        // la parte de imagen va hasta alphaOffset; el resto es máscara alfa (zlib)
        var imgEnd = start + alphaOffset;
      } else {
        var imgEnd = end;
      }
      const data = body.subarray(start, Math.min(imgEnd, end));
      // A veces el JPEG va precedido del par FF D9 FF D8 que había que quitar.
      let off = 0;
      if (data[0] === 0xff && data[1] === 0xd9 && data[2] === 0xff && data[3] === 0xd8) off = 4;
      const slice = data.subarray(off);
      let ext = null;
      if (slice[0] === 0xff && slice[1] === 0xd8) ext = 'jpg';
      else if (slice[0] === 0x89 && slice[1] === 0x50) ext = 'png';
      else if (slice[0] === 0x47 && slice[1] === 0x49) ext = 'gif';
      if (ext) {
        const name = `${basename(swfPath, extname(swfPath))}-${charId}.${ext}`;
        writeFileSync(join(outDir, name), slice);
        found.push({ name, size: slice.length });
      }
      counts[code] = (counts[code] ?? 0) + 1;
    }
    pos = end;
    if (code === 0) break; // End tag
  }
  return { found, counts };
}

const [, , swfPath, outDir] = process.argv;
if (!swfPath) {
  console.error('uso: node extract-swf-assets.mjs <ruta.swf> <carpetaSalida>');
  process.exit(1);
}
const dir = outDir ?? join(dirname(swfPath), '_extracted');
try {
  const { found, counts } = extract(swfPath, dir);
  const total = found.reduce((a, f) => a + f.size, 0);
  console.log(
    `${swfPath}\n  tags de imagen: ${JSON.stringify(counts)}  extraídos: ${found.length}  (${(total / 1024).toFixed(0)} KB)\n  destino: ${dir}`,
  );
  for (const f of found.slice(0, 8)) console.log(`    ${f.name} (${(f.size / 1024).toFixed(0)} KB)`);
} catch (e) {
  console.error(`${swfPath}: ${e.message}`);
}
