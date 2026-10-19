"""Read named placements from original SWF timelines (no external dependencies)."""
from pathlib import Path
import json
import struct
import zlib
import re

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'content/www.funkypotato.com/gamez/nick-block-party/assets/boards'

class Bits:
    def __init__(self, data, offset=0):
        self.data, self.bit = data, offset * 8
    def read(self, count, signed=False):
        value = 0
        for _ in range(count):
            value = value * 2 + ((self.data[self.bit // 8] >> (7 - self.bit % 8)) & 1)
            self.bit += 1
        return value - (1 << count) if signed and count and value & (1 << (count - 1)) else value
    @property
    def offset(self):
        return (self.bit + 7) // 8

def matrix(data, offset):
    b = Bits(data, offset)
    sx = sy = 1
    r0 = r1 = 0
    if b.read(1):
        n = b.read(5); sx, sy = b.read(n, True) / 65536, b.read(n, True) / 65536
    if b.read(1):
        n = b.read(5); r0, r1 = b.read(n, True) / 65536, b.read(n, True) / 65536
    n = b.read(5)
    x, y = b.read(n, True) / 20, b.read(n, True) / 20
    return [sx, r0, r1, sy, x, y], b.offset

def tags(data, offset):
    while offset + 2 <= len(data):
        tag = int.from_bytes(data[offset:offset+2], 'little'); offset += 2
        code, size = tag >> 6, tag & 63
        if size == 63:
            size = int.from_bytes(data[offset:offset+4], 'little'); offset += 4
        yield code, data[offset:offset+size]
        offset += size
        if code == 0: break

def parse(path):
    raw = path.read_bytes()
    body = zlib.decompress(raw[8:]) if raw[:3] == b'CWS' else raw[8:]
    header = Bits(body); n = header.read(5)
    for _ in range(4): header.read(n)
    sprites, symbols = {}, {}
    def timeline(data, offset, sprite):
        placements = []
        frame, label = 0, ''
        for code, payload in tags(data, offset):
            if code == 1:
                frame += 1
            elif code == 43:
                label = payload.split(b'\x00')[0].decode()
            elif code == 39:
                ident = int.from_bytes(payload[:2], 'little')
                timeline(payload, 4, ident)
            elif code == 76:
                pos = 2
                for _ in range(int.from_bytes(payload[:2], 'little')):
                    ident = int.from_bytes(payload[pos:pos+2], 'little'); pos += 2
                    end = payload.index(0, pos)
                    symbols[ident] = payload[pos:end].decode(); pos = end + 1
            elif code in (26, 70):
                flags = payload[0]; pos = 1
                flags2 = payload[pos] if code == 70 else 0
                if code == 70: pos += 1
                depth = int.from_bytes(payload[pos:pos+2], 'little'); pos += 2
                if flags2 & 8 or flags2 & 16 and flags & 2:
                    pos = payload.index(0, pos) + 1
                ident = None
                if flags & 2:
                    ident = int.from_bytes(payload[pos:pos+2], 'little'); pos += 2
                transform = [1, 0, 0, 1, 0, 0]
                if flags & 4: transform, pos = matrix(payload, pos)
                if flags & 8:
                    bits = Bits(payload, pos); add = bits.read(1); mult = bits.read(1); n = bits.read(4)
                    for _ in range(4 * (add + mult)): bits.read(n)
                    pos = bits.offset
                if flags & 16: pos += 2
                name = ''
                if flags & 32:
                    end = payload.index(0, pos); name = payload[pos:end].decode()
                placements.append(dict(id=ident, depth=depth, name=name, matrix=transform, frame=frame, label=label))
        sprites[sprite] = placements
    timeline(body, header.offset + 4, 0)
    return sprites, symbols

if __name__ == '__main__':
    definitions = (ROOT / 'nickparty/shared/game.ts').read_text(encoding='utf-8')
    dimensions = {name: (int(w), int(h)) for name, w, h in re.findall(r"id: '(\w+)', name: '[^']*', file: '[^']*', imageWidth: (\d+), imageHeight: (\d+)", definitions)}
    result = {}
    for name, (width, height) in dimensions.items():
        sprites, symbols = parse(ASSETS / f'{name}Board.swf')
        board_id = next(ident for ident, symbol in symbols.items() if symbol == f'boards.{name}Board')
        board = sprites[board_id]
        tiles = {int(p['name'][1:]): p for p in board if re.fullmatch(r't\d+', p['name'])}
        path = next(p for p in board if p['name'] == 'path')
        a, b, c, d, tx, ty = path['matrix']
        def point(x, y):
            return dict(x=round((a*x+c*y+tx)/width*100, 4), y=round((b*x+d*y+ty)/height*100, 4))
        nodes = [dict(x=round(tiles[i]['matrix'][4]/width*100, 4), y=round(tiles[i]['matrix'][5]/height*100, 4), next=[]) for i in range(len(tiles))]
        edges = {}
        for placement in sprites[path['id']]:
            match = re.fullmatch(r'o?(\d+)-(\d+)', placement['label'].strip())
            if not match or placement['depth'] != 1: continue
            source, target = map(int, match.groups())
            assert source < len(nodes) and target < len(nodes), (name, source, target)
            key = f'{source}-{target}'
            if key not in edges:
                edges[key] = [{k: nodes[source][k] for k in ('x', 'y')}]
                nodes[source]['next'].append(target)
            edges[key].append(point(*placement['matrix'][4:]))
        for key, points in edges.items():
            target = int(key.split('-')[1])
            # Preserve the authored curve while keeping the browser payload small.
            edges[key] = points[::3] + [{k: nodes[target][k] for k in ('x', 'y')}]
        assert all(n['next'] for n in nodes), (name, 'node without outgoing path')
        result[name] = dict(nodes=nodes, edges=edges)
        print(name, len(nodes), 'tiles;', len(edges), 'paths;', sum(len(n['next']) > 1 for n in nodes), 'junctions')
    (ROOT / 'nickparty/shared/original-board-paths.json').write_text(json.dumps(result, separators=(',', ':')), encoding='utf-8')
