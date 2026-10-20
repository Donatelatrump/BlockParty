import { useEffect, useMemo, useState } from 'react';
import manifest from '../shared/original-character-sprites.json' with { type: 'json' };
import characterFraming from '../shared/character-framing.json' with { type: 'json' };
import jumpFraming from '../shared/jump-framing.json' with { type: 'json' };

import customManifest from '../shared/custom-characters.json' with { type: 'json' };

type State = 'idle' | 'walk' | 'jump' | 'win' | 'lose' | 'hurt';
const SPRITES = manifest as Record<string, Record<string, Array<{ file: string }>>>;
type Framing = { x: number; y: number; width: number; height: number; aspect: number };
const CUSTOM = customManifest as Record<string, { fps: number; animations: Record<string, Array<{ file: string }>>; framing: Framing }>;
const spriteUrl = (file: string) => file.startsWith('custom/') ? `/assets/${file}` : `/assets/sprites/${file}`;
export function CharacterSprite({ id, state = 'idle', facing = 'SE', flip = false, label, portrait = false, progress }: { id: string; state?: State; facing?: 'SE' | 'NE' | 'S' | 'N'; flip?: boolean; label?: string; portrait?: boolean; progress?: number }) {
  const [frame, setFrame] = useState(0);
  const [ready, setReady] = useState(false);
  const custom = CUSTOM[id];
  const frames = custom?.animations ?? SPRITES[id];
  const requested = state === 'walk' ? `running${facing}` : state === 'jump' ? `jumping${facing === 'N' ? 'NE' : 'SE'}` : state === 'win' ? 'winFront' : state === 'lose' ? 'looseFront' : state === 'hurt' ? 'damageFront' : `idling${facing === 'N' || facing === 'NE' ? 'NE' : 'SE'}`;
  const animation = frames?.[requested] ?? frames?.[state === 'walk' ? 'runningSE' : 'idlingSE'] ?? frames?.idlingSE ?? [];
  const layers = useMemo(() => [...new Set(animation.map(item => item.file))], [animation]);
  const controlled = progress !== undefined;
  useEffect(() => {
    setFrame(0);
    setReady(false);
    let mounted = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const files = [...new Set(animation.flatMap(item => item.file.endsWith('.jpg') ? [item.file, item.file.replace('.jpg', '.mask.png')] : [item.file]))];
    void Promise.all(files.map(async file => {
      const image = new Image();
      image.src = spriteUrl(file);
      await image.decode();
    })).then(() => {
      if (!mounted) return;
      setReady(true);
      if (!controlled && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) timer = setInterval(() => setFrame(n => n + 1), 1000 / (custom?.fps ?? 24));
    }).catch(() => { /* Keep the first frame if an animation cannot be loaded. */ });
    return () => { mounted = false; if (timer) clearInterval(timer); };
  }, [id, requested, controlled]);
  const looping = state === 'idle' || state === 'walk';
  const index = controlled ? Math.min(animation.length - 1, Math.floor(Math.max(0, Math.min(1, progress!)) * animation.length)) : !ready ? 0 : looping ? frame % animation.length : Math.min(frame, animation.length - 1);
  const item = animation[index];
  if (!item) return null;
  const framing = portrait && state === 'idle' && facing === 'SE' ? custom?.framing ?? (characterFraming as Record<string, Framing>)[id] : null;
  const airFraming = state === 'jump' && !custom ? (jumpFraming as Record<string, Record<string, { scale: number; top: number; offsetX: number }>>)[id]?.[requested] : null;
  // Keep each bitmap and its mask attached. Replacing mask-image on one img
  // can paint a transparent frame while Chromium resolves the new mask.
  return <span className={`character-sprite sprite-${state}`} data-frame={index} role="img" aria-label={label ?? id} style={{ transform: flip ? 'scaleX(-1)' : undefined, ...(framing ? { width: `calc(var(--portrait-height, 74px) * ${framing.aspect})`, height: 'var(--portrait-height, 74px)' } : {}) }}>{layers.map(file => {
    const src = spriteUrl(file);
    const mask = file.endsWith('.jpg') ? `url(${src.replace('.jpg', '.mask.png')})` : undefined;
    return <img key={file} src={src} alt="" draggable={false} style={{ opacity: file === item.file ? 1 : 0, maskImage: mask, WebkitMaskImage: mask, ...(airFraming ? { height: `${airFraming.scale * 100}%`, top: `${airFraming.top * 100}%`, left: `${50 + airFraming.offsetX * 100}%` } : {}), ...(framing ? { width: `${100 / framing.width}%`, height: `${100 / framing.height}%`, left: `${-framing.x / framing.width * 100}%`, top: `${-framing.y / framing.height * 100}%`, transform: 'none' } : {}) }} />;
  })}</span>;
}
