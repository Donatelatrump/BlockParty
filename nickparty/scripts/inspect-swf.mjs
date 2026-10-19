/**
 * Lee el cuerpo de un .SWF (que va comprimido con zlib cuando el header es CWS)
 * y busca símbolos relacionados con capacidades de red de ActionScript.
 *
 * Uso: node scripts/inspect-swf.mjs <ruta.swf> [ruta2.swf ...]
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const PATTERNS = [
  'NetConnection', 'NetStream', 'Socket', 'XMLSocket', 'URLLoader', 'URLRequest',
  'Responder', 'SharedObject', 'Server', 'lobby', 'multiplayer', 'Multiplayer',
  'connect', 'joinGame', 'createRoom', 'smartfox', 'SmartFox', 'red5', 'wowza',
  'flash.net', 'flash.events', 'Security', 'crossdomain',
];

function decompose(buf) {
  const magic = buf.subarray(0, 3).toString('latin1');
  let body;
  let kind = magic;
  if (magic === 'CWS') {
    body = inflateSync(buf.subarray(8));
  } else if (magic === 'FWS') {
    body = buf.subarray(8);
  } else if (magic === 'ZWS') {
    return { kind: 'ZWS (LZMA, no inspeccionado)', body: null };
  } else {
    return { kind: `desconocido (${magic})`, body: null };
  }
  return { kind, body };
}

for (const file of process.argv.slice(2)) {
  let buf;
  try {
    buf = readFileSync(file);
  } catch (e) {
    console.log(`--- ${file}\n    no se pudo leer: ${e.message}`);
    continue;
  }
  const { kind, body } = decompose(buf);
  console.log(`--- ${file}`);
  console.log(`    header=${kind} tamaño=${(buf.length / 1024).toFixed(0)}KB`);
  if (!body) continue;

  const text = body.toString('latin1');
  const hits = PATTERNS.filter((p) => text.includes(p));
  console.log(
    `    coincidencias de red: ${hits.length ? hits.join(', ') : 'NINGUNA'}`,
  );
}
