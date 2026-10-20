"""Normalize supplied idle PNGs for the game without modifying source files."""
from pathlib import Path
from PIL import Image
import json
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'Personajes_Personalizados'
DEST = ROOT / 'nickparty/public/assets/custom'

def import_character(folder):
    ident = re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFKD', folder.name).encode('ascii', 'ignore').decode().lower()).strip('-')
    if not ident: raise ValueError(f'Invalid character folder: {folder.name}')
    files = sorted(folder.glob('idle_SE_*.png'))
    if len(files) != 8:
        raise ValueError(f'{folder.name}: expected eight idle_SE PNG frames')
    images = [Image.open(file).convert('RGBA') for file in files]
    if len({im.size for im in images}) != 1:
        raise ValueError('All source frames must use the same canvas')
    # Ignore almost transparent export noise when locating the silhouette.
    boxes = [im.getchannel('A').point(lambda a: 255 if a > 200 else 0).getbbox() for im in images]
    if any(box is None for box in boxes):
        raise ValueError('An idle frame is empty')
    box = (max(0, min(b[0] for b in boxes)-3), max(0, min(b[1] for b in boxes)-3), min(images[0].width, max(b[2] for b in boxes)+3), min(images[0].height, max(b[3] for b in boxes)+3))
    scale = min(200/(box[3]-box[1]), 210/(box[2]-box[0]))
    size = (round((box[2]-box[0])*scale), round((box[3]-box[1])*scale))
    left, top = (256-size[0])//2, 224-size[1]
    target = DEST / ident
    target.mkdir(parents=True, exist_ok=True)
    for file, im in zip(files, images):
        canvas = Image.new('RGBA', (256,256))
        canvas.alpha_composite(im.crop(box).resize(size, Image.Resampling.LANCZOS), (left,top))
        canvas.save(target/file.name, optimize=True)
    return ident, {
        'name': 'Martín' if ident == 'martin' else folder.name,
        'fps': 8,
        'animations': {'idlingSE': [{'file': f'custom/{ident}/{file.name}'} for file in files]},
        'framing': {'x':left/256,'y':top/256,'width':size[0]/256,'height':size[1]/256,'aspect':size[0]/size[1]},
        'portrait': f'custom/{ident}/idle_SE_01.png',
    }

if __name__ == '__main__':
    manifest = {}
    folders = sorted((d for d in SOURCE.iterdir() if d.is_dir() and list(d.glob('idle_SE_*.png'))), key=lambda d: (d.name.lower() != 'martin', d.name.casefold()))
    for folder in folders:
        ident, character = import_character(folder)
        if ident in manifest: raise ValueError(f'Duplicate character ID: {ident}')
        manifest[ident] = character
    if not manifest: raise ValueError('No custom character folders were found')
    (ROOT/'nickparty/shared/custom-characters.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print(f'Imported {len(manifest)} characters: '+', '.join(manifest))
