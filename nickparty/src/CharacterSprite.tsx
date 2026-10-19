import { useEffect, useState } from 'react';
import manifest from '../shared/original-character-sprites.json' with { type: 'json' };

type State = 'idle' | 'walk' | 'jump' | 'win' | 'lose' | 'hurt';
const SPRITES = manifest as Record<string, Record<string, Array<{ file: string }>>>;
export function CharacterSprite({ id, state = 'idle', facing = 'SE', flip = false, label }: { id: string; state?: State; facing?: 'SE' | 'NE' | 'S' | 'N'; flip?: boolean; label?: string }) {
  const [frame, setFrame] = useState(0);
  const [ready, setReady] = useState(false);
  const frames = SPRITES[id];
  const requested = state === 'walk' ? `running${facing}` : state === 'jump' ? `jumping${facing === 'N' ? 'NE' : 'SE'}` : state === 'win' ? 'winFront' : state === 'lose' ? 'looseFront' : state === 'hurt' ? 'damageFront' : `idling${facing === 'N' || facing === 'NE' ? 'NE' : 'SE'}`;
  const animation = frames?.[requested] ?? frames?.[state === 'walk' ? 'runningSE' : 'idlingSE'] ?? [];
  useEffect(() => {
    setFrame(0);
    setReady(false);
    let mounted = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const files = [...new Set(animation.flatMap(item => [item.file, item.file.replace('.jpg', '.mask.png')]))];
    void Promise.all(files.map(file => new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(); image.onerror = () => reject(new Error(file));
      image.src = `/assets/sprites/${file}`;
    }))).then(() => {
      if (!mounted) return;
      setReady(true);
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) timer = setInterval(() => setFrame(n => n + 1), 1000 / 24);
    }).catch(() => { /* Keep the first frame if an animation cannot be loaded. */ });
    return () => { mounted = false; if (timer) clearInterval(timer); };
  }, [id, requested]);
  const item = animation[ready ? frame % animation.length : 0];
  if (!item) return null;
  const src = `/assets/sprites/${item.file}`;
  return <span className={`character-sprite sprite-${state}`} role="img" aria-label={label ?? id} style={{ transform: flip ? 'scaleX(-1)' : undefined }}><img src={src} alt="" draggable={false} style={{ maskImage: `url(${src.replace('.jpg', '.mask.png')})`, WebkitMaskImage: `url(${src.replace('.jpg', '.mask.png')})` }} /></span>;
}
