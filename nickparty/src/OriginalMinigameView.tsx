import { hockeyAim } from '../shared/hockey';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { MinigameState, PlayerState } from '../shared/game';
import { definition, simonWindow, type MiniInput, type OriginalMinigame } from '../shared/minigames';
import { CharacterAvatar } from './CharacterAvatar';
import { CharacterSprite } from './CharacterSprite';
import { Coin, CoinBurst } from './Coins';
import { art, MinigameStage, OriginalBackdrop } from './MinigameStage';
import './minigames.css';

const COLORS = ['#ff953f', '#5dc8ff', '#b1ee59', '#db93ff'];
const COLOR_NAMES = ['Naranja', 'Azul', 'Verde', 'Violeta'];
const FOOD = ['Tomate', 'Zanahoria', 'Guisantes', 'Pizza'];
const FOOD_ART = ['tomato', 'carrot', 'peas', 'pizza'];
const MOVE_GAMES = new Set(['paint', 'catcher', 'escape', 'falling', 'teetering', 'escapeyo', 'king_of_the_heap', 'apartment_maze', 'airhockey', 'color_crumble', 'signal_sprint', 'coin_scramble']);
const JUMP_GAMES = new Set(['jumper', 'pizza_pursuit', 'escapeyo', 'bouncybed', 'lolly', 'coin_scramble']);
const TOUCH_HINTS: Partial<Record<OriginalMinigame, string>> = {
  color_crumble: 'Muévete al color anunciado antes de que caiga el suelo.', signal_sprint: 'Mantén la flecha para correr; suelta al ver la advertencia.', coin_scramble: 'Usa la cruceta para recoger monedas y Saltar para esquivar la onda.',
  fleas: 'Toca una pulga y luego su cubo. También puedes arrastrarla.', demanding_goat: 'Toca la comida que pide y después toca la cabra.',
  escapeyo: 'Alterna los dos botones de dirección. Salta las cajas.', airhockey: 'Tu portería está abajo. Desliza el control o usa las flechas para defenderla.',
  lolly: 'Toca Lamer repetidamente.', bouncybed: 'Toca Rebotar al aterrizar.', jumper: 'Toca Saltar cuando se acerque la espátula.',
  pizza_pursuit: 'Toca Saltar cuando se acerque una caja.', paint: 'Mantén las flechas para pintar el suelo.', apartment_maze: 'Usa la cruceta: busca dos llaves y después la puerta 22.',
  dodge: 'Toca las medusas naranjas de tu bandera. Evita las violetas.',
};
interface Props { mg: MinigameState; players: PlayerState[]; me: string | null; onInput: (input: MiniInput) => void }

export function OriginalMinigameView({ mg, players, me, onInput }: Props) {
  const [now, setNow] = useState(Date.now);
  const [selected, setSelected] = useState<number | null>(null);
  const [rival, setRival] = useState('');
  const [touch, setTouch] = useState(() => matchMedia('(pointer: coarse)').matches);
  const [size, setSize] = useState({ width: 960, height: 500 });
  const surface = useRef<HTMLElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const held = useRef(new Map<string, MiniInput['key']>());
  const sendRef = useRef(onInput); sendRef.current = onInput;
  const canPlay = useRef(false);
  const lastAim = useRef(0);
  const a = mg.arena!;
  const kind = mg.kind as OriginalMinigame;
  const peers = players.filter(player => a.players[player.id]);
  const def = definition(kind);
  const startsAt = mg.startsAt!;
  const elapsed = Math.max(0, now - startsAt);
  const prep = now < startsAt;
  const instructions = now < startsAt - 3000;
  const results = !!mg.resultsUntil;
  const p = me ? a.players[me] : null;
  const active = !!p?.alive && p.finishedAt === null && !prep && !results && now < mg.endsAt;
  canPlay.current = active;
  const send = (input: MiniInput) => { if (canPlay.current) sendRef.current(input); };
  const owner = (id: string | null) => peers.find(player => player.id === id);

  useEffect(() => {
    const query = matchMedia('(pointer: coarse)');
    const update = () => setTouch(query.matches); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const node = shell.current; if (!node) return;
    const resize = () => {
      const rect = node.getBoundingClientRect();
      const ratio = kind === 'airhockey' ? 1 : rect.width < 600 && rect.height > rect.width ? 1.12 : 1.92;
      const width = Math.min(rect.width, rect.height * ratio);
      setSize({ width, height: width / ratio });
    };
    const observer = new ResizeObserver(resize); observer.observe(node); resize();
    return () => observer.disconnect();
  }, [kind]);
  useEffect(() => {
    held.current.clear(); setSelected(null); setRival('');
    surface.current?.focus({ preventScroll: true });
    const keyMap: Record<string, MiniInput['key']> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down', Space: 'action' };
    const down = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const key = keyMap[event.code]; if (!key) return;
      event.preventDefault(); if (event.repeat) return;
      if (key === 'action' && !JUMP_GAMES.has(kind)) return;
      if (key !== 'action') held.current.set(event.code, key);
      if (canPlay.current) sendRef.current({ key });
    };
    const up = (event: KeyboardEvent) => held.current.delete(event.code);
    const release = () => held.current.clear();
    let direction = 0;
    const timer = window.setInterval(() => {
      const keys = [...new Set(held.current.values())];
      if (canPlay.current && keys.length && kind !== 'escapeyo') sendRef.current({ key: keys[direction++ % keys.length] });
    }, 90);
    let frame = 0;
    const animate = () => { setNow(Date.now()); frame = requestAnimationFrame(animate); };
    frame = requestAnimationFrame(animate);
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', release); document.addEventListener('visibilitychange', release);
    return () => { clearInterval(timer); cancelAnimationFrame(frame); held.current.clear(); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', release); document.removeEventListener('visibilitychange', release); };
  }, [mg.id, kind]);
  useEffect(() => {
    const old = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = old; };
  }, []);

  const hold = (key: MiniInput['key']) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault(); if (!canPlay.current) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      if (key !== 'action') held.current.set(`pointer-${event.pointerId}`, key);
      send({ key });
    },
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => held.current.delete(`pointer-${event.pointerId}`),
    onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => held.current.delete(`pointer-${event.pointerId}`),
    onLostPointerCapture: (event: ReactPointerEvent<HTMLButtonElement>) => held.current.delete(`pointer-${event.pointerId}`),
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => { if (event.detail === 0) send({ key }); },
  });
  const drag = (id: number) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => { if (!active) return; setSelected(id); event.currentTarget.setPointerCapture(event.pointerId); },
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => {
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-drop]');
      if (target) { send({ key: 'drop', target: id, value: kind === 'fleas' ? Number(target.dataset.drop) : undefined }); setSelected(null); }
    },
  });
  const aim = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (kind !== 'airhockey' || !active || Date.now()-lastAim.current < 75) return;
    lastAim.current = Date.now(); const rect = event.currentTarget.getBoundingClientRect();
    const coordinate = hockeyAim((event.clientX-rect.left)/rect.width*100,peers.length);
    send({ key: 'aim', value: Math.max(0, Math.min(100, coordinate)) });
  };
  const sw = simonWindow(elapsed);
  const ranking = [...peers].sort((x, y) => (a.players[x.id].finishedAt ?? Infinity)-(a.players[y.id].finishedAt ?? Infinity) || Number(a.players[y.id].alive)-Number(a.players[x.id].alive) || (mg.collected[y.id] ?? 0)-(mg.collected[x.id] ?? 0));
  const rivalId = peers.some(player => player.id === rival) ? rival : peers.find(player => player.id !== me)?.id;
  const hint = touch ? TOUCH_HINTS[kind] ?? (MOVE_GAMES.has(kind) ? 'Mantén los botones de dirección para moverte.' : def.controls) : def.controls;
  const localObjects = kind === 'dodge' ? a.objects.filter(o => o.owner === me) : [];
  return <section ref={surface} tabIndex={-1} className={`mg-overlay original-mg mg-${kind}${touch ? ' touch-game' : ''}`} aria-label={mg.name}>
    <header className="mg-head"><h2 className="mg-title">{mg.name}</h2><span className="mg-timer" role="timer">{results ? 'Resultados' : prep ? 'Prepárate' : `${Math.max(0, Math.ceil((mg.endsAt-now)/1000))}s`}</span></header>
    <div className="mg-bar"><div className="mg-bar-fill" style={{ width: `${Math.max(0,Math.min(100,prep ? 100 : (mg.endsAt-now)/(def.seconds*10)))}%` }} /></div>
    <p className="mg-desc">{p && !p.alive ? 'Has quedado eliminado. Puedes seguir mirando.' : p?.finishedAt ? '¡Has terminado!' : hint}</p>
    <div className="arena-shell" ref={shell}>
      <div className={`arena arena-${kind}`} style={{ width: size.width, height: size.height }} onPointerDown={event => { if (kind === 'airhockey') { event.currentTarget.setPointerCapture(event.pointerId); aim(event); } }} onPointerMove={aim}>
        <OriginalBackdrop kind={kind} />
        {kind === 'simon' ? <div className="simon-game"><p role="status">{sw.showing ? 'Observa…' : 'Repite la secuencia'} · Ronda {sw.round+1}</p><div className="simon-pad">{COLORS.map((color, index) => <button aria-label={COLOR_NAMES[index]} key={color} style={{ background: color }} className={sw.showing && sw.lit && a.sequence[sw.index]===index ? 'simon-lit' : ''} disabled={!active || sw.showing || (p?.cursor ?? 0)>=sw.length} onClick={() => send({ key: 'select', target: index })}>{index+1}</button>)}</div><span>{p?.cursor ?? 0}/{sw.length} colores</span></div>
        : kind === 'fleas' ? <><div className="flea-field">{a.objects.filter(o => o.active).slice(0, touch ? 6 : 9).map(o => <button disabled={!active} aria-label={`Pulga ${COLOR_NAMES[o.type]}`} aria-pressed={selected===o.id} className="arena-flea" key={o.id} style={{ backgroundColor: COLORS[o.type] }} {...drag(o.id)} onClick={() => setSelected(o.id)}><img src={art(kind,'flea')} alt="" /></button>)}</div><div className="flea-buckets">{COLORS.map((color,i) => <button key={color} data-drop={i} style={{ borderColor: color }} disabled={!active} onClick={() => { if (selected!==null) { send({ key: 'drop', target: selected, value: i }); setSelected(null); } }}>{COLOR_NAMES[i]}</button>)}</div></>
        : kind === 'demanding_goat' ? <div className="goat-game"><p className="goat-request">Quiero {FOOD[a.request].toLowerCase()} <img src={art(kind, FOOD_ART[a.request])} alt="" /></p><button data-drop="goat" aria-label="Entregar comida a la cabra" className="goat" disabled={!active} onClick={() => { if (selected!==null) { send({ key: 'drop', target: selected }); setSelected(null); } }}><img src={art(kind,'goat')} alt="" /><span>Entregar</span></button><div className="goat-food">{FOOD.map((food,i) => <button disabled={!active} aria-pressed={selected===i} key={food} {...drag(i)} onClick={() => setSelected(i)}><img src={art(kind,FOOD_ART[i])} alt="" /><span>{food}</span></button>)}</div></div>
        : kind === 'lockers' ? <div className="locker-rows">{[me, rivalId].filter((id): id is string => !!id).map(id => <div className="locker-group" key={id}><div className="locker-label">{id===me ? 'Tus casilleros: ciérralos' : <label>Rival <select aria-label="Casilleros del rival" value={rivalId} onChange={event => setRival(event.target.value)}>{peers.filter(player => player.id!==me).map(player => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>}</div><div className="locker-bank">{a.objects.filter(o => o.owner===id).map(o => <button disabled={!active} aria-label={`${owner(id)?.name}, casillero ${o.id%6+1}, ${o.type ? 'cerrado' : 'abierto'}`} className={o.type ? 'locker-closed' : ''} key={o.id} onClick={() => send({ key: 'select', target: o.id })}><img src={art(kind,'locker')} alt="" /><span>{o.id%6+1}</span></button>)}</div></div>)}</div>
        : kind === 'lolly' ? <div className="lolly-race">{[...peers].sort((x,y)=>Number(y.id===me)-Number(x.id===me)).map(player => <div className={player.id===me ? 'lolly-mine' : ''} key={player.id}><CharacterSprite id={player.avatar} label={player.name} /><div className="lollipop" style={{ transform: `scale(${Math.max(.08,1-a.players[player.id].progress/110)})` }}><img src={art(kind,'lollipop')} alt="" /></div><b>{player.id===me ? 'TÚ' : player.name}</b><progress max="100" value={a.players[player.id].progress} /></div>)}</div>
        : kind === 'dodge' ? <><div className="jelly-lanes">{[0,1,2].map(i => <span key={i} />)}</div>{localObjects.map(o => {
          const y = o.active && o.spawnsAt !== undefined ? (elapsed-o.spawnsAt)/1000*o.vy : o.y;
          if (y<0 || y>=90 || !o.active && (!o.captured || elapsed-(o.resolvedAt ?? 0)>650)) return null;
          return <button disabled={!active || !o.active} aria-label={o.type===0 ? 'Medusa naranja' : 'Medusa distractora'} className={`arena-jelly${o.active ? '' : ' jelly-caught'}`} key={o.id} style={{ left: `${o.x}%`, top: `${8+y*.85}%` }} onClick={() => send({ key: 'select', target: o.id })}><img src={art(kind,o.type===0 ? 'jelly' : 'decoy')} alt="" />{!o.active && <img className="jelly-bubble" src={art(kind,'bubble')} alt="" />}</button>;
        })}<div className="jelly-flag">Tu bandera · {'♥'.repeat(Math.max(0,p?.lives ?? 0))}</div></>
        : <MinigameStage key={mg.id} mg={mg} players={peers} me={me} now={now} />}
        {(prep || results) && <div className="mini-phase-overlay">
          {results ? <div className="mg-results"><h3>{a.winner ? `${owner(a.winner)?.name} termina primero` : 'Minijuego terminado'}</h3><ol>{ranking.map(player => <li key={player.id}><CharacterAvatar id={player.avatar} className="mini-avatar" color={player.color} /><b>{player.name}</b><span>{mg.collected[player.id] ?? 0} puntos</span><span className="result-reward"><Coin /> +{mg.rewards?.[player.id] ?? 0}{(mg.rewards?.[player.id] ?? 0)>0 && <CoinBurst amount={mg.rewards![player.id]} />}</span></li>)}</ol></div>
          : instructions ? <div className="mg-instructions"><span className="mg-eyebrow">CÓMO JUGAR</span><h3>{mg.name}</h3><p>{def.desc}</p><strong>{hint}</strong><p>Comienza en {Math.ceil((startsAt-now)/1000)} segundos</p></div>
          : <div className="mg-countdown" role="status" key={Math.ceil((startsAt-now)/1000)}>{Math.max(1,Math.ceil((startsAt-now)/1000))}</div>}
        </div>}
      </div>
    </div>
    {kind==='airhockey'&&!results&&<div className="hockey-controller"><label htmlFor="hockey-bar">Tu portería está abajo · atajada +1 · gol +3 · recibido −1</label><input id="hockey-bar" aria-label="Mover barra de hockey" type="range" min="18" max="82" step="1" value={p?.x??50} disabled={!active} onChange={event=>send({key:'aim',value:Number(event.target.value)})} /></div>}
    {!results && <div className="arena-controls">
      {MOVE_GAMES.has(kind) && <div className={`dpad${['paint','apartment_maze','color_crumble','coin_scramble'].includes(kind) ? ' dpad-four' : ''}`}>{([['left','←'],['up','↑'],['down','↓'],['right','→']] as const).filter(([key])=>kind === 'signal_sprint' ? key === 'right' : ['paint','apartment_maze','color_crumble','coin_scramble'].includes(kind) || key==='left' || key==='right').map(([key,label])=><button className={`control-${key}`} disabled={!active} aria-label={`Mover ${key}`} key={key} {...hold(key)}>{label}</button>)}</div>}
      {JUMP_GAMES.has(kind) && <button className="mini-action" disabled={!active} {...hold('action')}>{kind==='lolly' ? 'Lamer' : kind==='bouncybed' ? 'Rebotar' : 'Saltar'}{!touch && <small>Espacio</small>}</button>}
    </div>}
    <div className="mg-scores">{peers.map(player=><span key={player.id} className={`mg-score${player.id===me ? ' mg-score-me' : ''}`} style={{ borderColor: player.color }}><CharacterAvatar id={player.avatar} className="mini-avatar" color={player.color} />{player.id===me ? 'Tú' : player.name}: <b>{mg.collected[player.id] ?? 0}</b>{!a.players[player.id].alive && ' · fuera'}</span>)}</div>
  </section>;
}
