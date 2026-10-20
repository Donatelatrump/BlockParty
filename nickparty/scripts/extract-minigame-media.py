"""Extract original SWF bitmap art with its alpha channel; no redrawing.

Intermediate images and contact sheets go to .asset-extraction/minigames.
The explicit selection in MINIGAME_ART is copied into public/assets/minigames.
"""
from pathlib import Path
from io import BytesIO
import json
import struct
import zlib
import sys
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'content/www.funkypotato.com/gamez/nick-block-party/assets'
TEMP = ROOT / 'nickparty/.asset-extraction/minigames'
DEST = ROOT / 'nickparty/public/assets/minigames'
MINIGAME_ART = {
    'paint': {'background': 'paint/world-1.png', 'foreground': 'paint/world-12.png'},
    'jumper': {'background': 'jumper/main-186.png', 'spatula': 'jumper/main-32.png'},
    'falling': {'background': 'falling/main-46.png', 'platform': 'falling/main-33.png'},
    'escape': {'background': 'escape/world-35.png', 'oom': 'escape/characters-163.png', 'oom-windup': 'escape/characters-177.png', 'oom-strike': 'escape/characters-191.png'},
    'teetering': {'background': 'teetering/teetering-64.png', 'log': 'teetering/teetering-199.png'},
    'catcher': {'background': 'catcher/world-129.png'},
    'fleas': {'background': 'fleas/world-802.png', 'flea': 'fleas/fleas-1.png', 'tweezers': 'fleas/tweezers-16.png'},
    'lockers': {'background': 'lockers/world-3.png', 'locker': 'lockers/world-59.png'},
    'lolly': {'background': 'lollypop/world-1.png', 'table': 'lollypop/world-5.png', 'lollipop': 'lollypop/world-8.png'},
    'bouncybed': {'background': 'bed/world-67.png', 'beds': 'bed/world-66.png'},
    'simon': {'background': 'simon/world-32.png', 'machine': 'simon/world-31.png'},
    'airhockey': {'background': 'airhockey/world-107.png', 'table': 'airhockey/world-104.png'},
    'escapeyo': {'background': 'escapeyo/world-61.png', 'crate': 'escapeyo/world-33.png', 'yo': 'escapeyo/world-74.png'},
    'pizza_pursuit': {'crate': 'pizza_pursuit/world-139.png', 'pipe': 'pizza_pursuit/world-136.png', 'slime': 'pizza_pursuit/world-157.png', 'pizza': 'pizza_pursuit/world-23.png'},
    'king_of_the_heap': {'background': 'king_of_the_heap/world-148.png', 'garbage': 'king_of_the_heap/world-92.png'},
    'apartment_maze': {'background': 'apartment_maze/world-178.png', 'door': 'apartment_maze/world-159.png', 'frame': 'apartment_maze/world-157.png'},
    'demanding_goat': {'background': 'demanding_goat/world-112.png', 'goat': 'demanding_goat/world-136.png', 'table': 'demanding_goat/world-123.png', 'tomato': 'demanding_goat/world-87.png', 'carrot': 'demanding_goat/world-101.png', 'peas': 'demanding_goat/world-99.png', 'pizza': 'demanding_goat/world-91.png'},
    'dodge': {'jelly': 'dodge/world-65.png', 'decoy': 'dodge/world-44.png', 'bubble': 'dodge/world-39.png'},
}

def tags(data, offset):
    while offset + 2 <= len(data):
        h = int.from_bytes(data[offset:offset+2], 'little'); offset += 2
        code, size = h >> 6, h & 63
        if size == 63:
            size = int.from_bytes(data[offset:offset+4], 'little'); offset += 4
        payload = data[offset:offset+size]; offset += size
        yield code, payload
        if code == 0: break

def extract(path, folder):
    raw = path.read_bytes()
    data = zlib.decompress(raw[8:]) if raw[:3] == b'CWS' else raw[8:]
    offset = (5 + 4 * (data[0] >> 3) + 7) // 8 + 4
    folder.mkdir(parents=True, exist_ok=True)
    result = []
    for code, d in tags(data, offset):
        if code not in (21, 35, 36): continue
        ident = int.from_bytes(d[:2], 'little')
        try:
            if code in (21, 35):
                start = 6 if code == 35 else 2
                end = start + int.from_bytes(d[2:6], 'little') if code == 35 else len(d)
                pixels = d[start:end]
                if pixels[:4] == b'\xff\xd9\xff\xd8': pixels = pixels[2:]
                im = Image.open(BytesIO(pixels)).convert('RGBA')
                if code == 35:
                    alpha = zlib.decompress(d[end:])
                    im.putalpha(Image.frombytes('L', im.size, alpha))
            else:
                fmt = d[2]; w, h = struct.unpack_from('<HH', d, 3)
                if fmt == 5:
                    pixels = zlib.decompress(d[7:])
                    im = Image.frombytes('RGBA', (w, h), pixels, 'raw', 'ARGB')
                    # SWF lossless2 stores premultiplied colour.
                    values = bytearray(im.tobytes())
                    for i in range(0, len(values), 4):
                        a = values[i+3]
                        if a:
                            for c in range(3): values[i+c] = min(255, round(values[i+c] * 255 / a))
                    im = Image.frombytes('RGBA', (w, h), bytes(values))
                else: continue
            name = f'{path.stem}-{ident}.png'
            im.save(folder / name)
            result.append({'file': name, 'width': im.width, 'height': im.height, 'alpha': im.getextrema()[3][0] < 255})
        except (OSError, ValueError, zlib.error):
            continue
    return result

def sheet(folder, items):
    selected = sorted(items, key=lambda i: i['width'] * i['height'], reverse=True)[:24]
    canvas = Image.new('RGB', (960, 200 * ((len(selected) + 3) // 4)), '#d0d7de')
    draw = ImageDraw.Draw(canvas)
    for i, item in enumerate(selected):
        x, y = i % 4 * 240, i // 4 * 200
        im = Image.open(folder / item['file'])
        im.thumbnail((232, 170))
        canvas.paste(im, (x + (240-im.width)//2, y), im)
        draw.text((x+4, y+172), f"{item['file']} {item['width']}x{item['height']}", fill='black')
    if selected: canvas.save(folder / 'sheet.jpg')

if __name__ == '__main__':
    if (TEMP / 'manifest.json').exists() and '--refresh' not in sys.argv:
        manifest = json.loads((TEMP / 'manifest.json').read_text())
    else:
        manifest = None
    if manifest is None:
        manifest = {}
        for folder in sorted((SOURCE / 'minigames').iterdir()):
            if not folder.is_dir() or folder.name == 'challenges': continue
            items = []
            for path in folder.glob('*.swf'): items += extract(path, TEMP / folder.name)
            manifest[folder.name] = items
            sheet(TEMP / folder.name, items)
        items = extract(SOURCE / 'boards/common.swf', TEMP / 'coins')
        sheet(TEMP / 'coins', items); manifest['coins'] = items
        (TEMP / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    for kind, assets in MINIGAME_ART.items():
        target = DEST / kind; target.mkdir(parents=True, exist_ok=True)
        for name, source in assets.items():
            im = Image.open(TEMP / source)
            if kind == 'escape' and name.startswith('oom'):
                boxes = [Image.open(TEMP / source).getbbox() for key, source in assets.items() if key.startswith('oom')]
                im = im.crop((min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)))
            elif name not in ('background', 'foreground', 'table', 'beds') and im.getbbox():
                im = im.crop(im.getbbox())
            im.save(target / f'{name}.webp', lossless=True)
    # Keep a shared frame rectangle; individually trimming frames would wobble.
    frames = [Image.open(TEMP / 'coins' / item['file']) for item in manifest['coins'] if 2388 <= int(item['file'].split('-')[1].split('.')[0]) < 2497 and item['width'] == 640]
    boxes = [im.getbbox() for im in frames]
    box = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    strip = Image.new('RGBA', (64 * 24, 64))
    for i in range(24):
        frame = ImageOps.contain(frames[round(i * (len(frames)-1) / 24)].crop(box), (60, 60))
        strip.paste(frame, (i*64+(64-frame.width)//2, (64-frame.height)//2))
    target = DEST / 'coins'; target.mkdir(parents=True, exist_ok=True)
    strip.save(target / 'spin.webp', lossless=True)
    (DEST / 'sources.json').write_text(json.dumps(MINIGAME_ART, indent=2), encoding='utf-8')
    print('Published original art for', len(MINIGAME_ART), 'minigames and 24 coin frames.')
