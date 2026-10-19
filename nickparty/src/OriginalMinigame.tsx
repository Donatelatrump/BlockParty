import { useEffect, useRef, useState } from 'react';
import type { MinigameState, PlayerState } from '../shared/game';
import { MAZE, definition, simonWindow, type MiniInput, type OriginalMinigame } from '../shared/minigames';
import { CharacterAvatar } from './CharacterAvatar';
import { CharacterSprite } from './CharacterSprite';

const COLORS = ['#ff953f', '#5dc8ff', '#b1ee59', '#db93ff'];
const COLOR_NAMES = ['Naranja', 'Azul', 'Verde', 'Violeta'];
const FOOD = ['Manzana', 'Zanahoria', 'Lechuga', 'Pan'];
const FOOD_ICONS = ['🍎', '🥕', '🥬', '🍞'];
interface Props { mg: MinigameState; players: PlayerState[]; me: string | null; onInput: (input: MiniInput) => void }
export function OriginalMinigameView({ mg, players, me, onInput }: Props) {
  const [now, setNow] = useState(Date.now);
  const [selected, setSelected] = useState<number | null>(null);
  const pressed = useRef(new Set<MiniInput['key']>());
  const sendRef = useRef(onInput); sendRef.current = onInput;
  const canPlay = useRef(false);
  const lastAim = useRef(0);
  const a = mg.arena!;
  const kind = mg.kind as OriginalMinigame;
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
  useEffect(() => {
    pressed.current.clear(); setSelected(null);
    const keyMap: Record<string, MiniInput['key']> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', ' ': 'action' };
    const keydown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest('input, textarea, select')) return;
      const key = keyMap[event.key]; if (!key) return;
      event.preventDefault();
      if (event.repeat || !canPlay.current) return;
      if (key !== 'action') pressed.current.add(key);
      sendRef.current({ key });
    };
    const keyup = (event: KeyboardEvent) => { if (keyMap[event.key]) pressed.current.delete(keyMap[event.key]); };
    const blur = () => pressed.current.clear();
    const timer = setInterval(() => { if (canPlay.current) for (const key of pressed.current) sendRef.current({ key }); }, 100);
    let frame = 0;
    const animate = () => { setNow(Date.now()); frame = requestAnimationFrame(animate); };
    frame = requestAnimationFrame(animate);
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('blur', blur);
    return () => { clearInterval(timer); cancelAnimationFrame(frame); window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', blur); };
  }, [mg.id]);
  const owner = (id: string | null) => players.find(p => p.id === id);
  const sw = simonWindow(elapsed);
  const countdown = Math.max(1, Math.ceil((startsAt - now) / 1000));
  const hold = (key: MiniInput['key']) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); if (key !== 'action') pressed.current.add(key); send({ key }); },
    onPointerUp: () => pressed.current.delete(key), onPointerCancel: () => pressed.current.delete(key),
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => { if (e.detail === 0) send({ key }); },
  });
  const drop = (value: number) => { if (selected === null) return; send({ key: 'drop', target: selected, value }); setSelected(null); };
  const moveGames = ['paint', 'catcher', 'escape', 'falling', 'teetering', 'escapeyo', 'king_of_the_heap', 'apartment_maze', 'airhockey'];
  const jumpGames = ['jumper', 'pizza_pursuit', 'escapeyo', 'bouncybed', 'lolly'];
  const ranking = [...players].sort((x, y) => {
    const ax = a.players[x.id], ay = a.players[y.id];
    return (ax?.finishedAt ?? Infinity) - (ay?.finishedAt ?? Infinity) || Number(ay?.alive) - Number(ax?.alive) || (mg.collected[y.id] ?? 0) - (mg.collected[x.id] ?? 0);
  });
  return <section className={`mg-overlay original-mg mg-${kind}`} aria-label={mg.name}>
    <div className="mg-head"><h2 className="mg-title">{mg.name}</h2><span className="mg-timer" role="timer">{results ? 'Resultados' : prep ? 'Prepárate' : `${Math.max(0, Math.ceil((mg.endsAt - now) / 1000))}s`}</span></div>
    <div className="mg-bar"><div className="mg-bar-fill" style={{ width: `${prep ? 100 : Math.max(0, (mg.endsAt - now) / (def.seconds * 10))}%` }} /></div>
    {instructions ? <div className="mg-instructions"><span className="mg-eyebrow">MINIJUEGO</span><h3>{mg.name}</h3><p>{def.desc}</p><strong>{def.controls}</strong><p>Comienza en {countdown} segundos. Todos juegan al mismo tiempo.</p></div> : prep ? <div className="mg-countdown" role="status" key={countdown}>{countdown}<small>{def.controls}</small></div> : results ? <div className="mg-results"><h3>{a.winner ? `${owner(a.winner)?.name} termina primero` : 'Minijuego terminado'}</h3><ol>{ranking.map(player => <li key={player.id}><CharacterAvatar id={player.avatar} className="mini-avatar" color={player.color} /><b>{player.name}</b><span>{mg.collected[player.id] ?? 0} puntos</span></li>)}</ol><p>Volvemos al tablero en {Math.max(0, Math.ceil((mg.resultsUntil! - now) / 1000))}…</p></div> : <>
      <p className="mg-desc">{def.controls} {p && !p.alive ? 'Has quedado eliminado. Puedes ver a los demás.' : p?.finishedAt !== null && p?.finishedAt !== undefined ? '¡Has terminado!' : ''}</p>
      <div className={`arena arena-${kind}`} onPointerMove={e => {
        if (kind !== 'airhockey' || !active || Date.now() - lastAim.current < 90) return;
        lastAim.current = Date.now();
        const rect = e.currentTarget.getBoundingClientRect();
        const side = players.findIndex(player => player.id === me) % 3;
        send({ key: 'aim', value: Math.max(0, Math.min(100, side === 0 ? (e.clientX - rect.left) / rect.width * 100 : (e.clientY - rect.top) / rect.height * 100)) });
      }}>
        {kind === 'simon' ? <div className="simon-game"><p role="status">{sw.showing ? 'Observa…' : 'Repite la secuencia'} · Ronda {sw.round + 1}</p><div className="simon-pad">{COLORS.map((color, index) => <button aria-label={COLOR_NAMES[index]} key={color} style={{ background: color }} className={sw.showing && sw.lit && a.sequence[sw.index] === index ? 'simon-lit' : ''} disabled={!active || sw.showing || (p?.cursor ?? 0) >= sw.length} onClick={() => send({ key: 'select', target: index })}>{index + 1}</button>)}</div><p>{p?.cursor ?? 0}/{sw.length} colores</p></div>
        : kind === 'fleas' ? <><div className="flea-dog" aria-hidden="true">🐕</div>{a.objects.filter(o => o.active).map(o => <button draggable disabled={!active} aria-label={`Pulga ${COLOR_NAMES[o.type]}`} className={`arena-flea${selected === o.id ? ' selected' : ''}`} key={o.id} style={{ left: `${o.x}%`, top: `${o.y}%`, background: COLORS[o.type] }} onDragStart={e => { setSelected(o.id); e.dataTransfer.setData('text/plain', String(o.id)); }} onClick={() => setSelected(o.id)}>•</button>)}<div className="flea-buckets">{COLORS.map((color, i) => <button key={color} style={{ borderColor: color }} disabled={!active} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const id = Number(e.dataTransfer.getData('text/plain')); if (Number.isSafeInteger(id)) send({ key: 'drop', target: id, value: i }); setSelected(null); }} onClick={() => drop(i)}>Cubo {COLOR_NAMES[i]}</button>)}</div></>
        : kind === 'demanding_goat' ? <div className="goat-game"><p className="goat-request">Quiero {FOOD[a.request].toLowerCase()} {FOOD_ICONS[a.request]}</p><button aria-label="Entregar comida a la cabra" className="goat" disabled={!active} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const id = Number(e.dataTransfer.getData('text/plain')); if (Number.isSafeInteger(id)) send({ key: 'drop', target: id }); }} onClick={() => { if (selected !== null) send({ key: 'drop', target: selected }); setSelected(null); }}>🐐<small>Entregar</small></button><div className="goat-food">{FOOD.map((food, i) => <button draggable disabled={!active} aria-pressed={selected === i} key={food} onClick={() => setSelected(i)} onDragStart={e => { setSelected(i); e.dataTransfer.setData('text/plain', String(i)); }}>{FOOD_ICONS[i]} {food}</button>)}</div></div>
        : kind === 'lockers' ? <div className="locker-rows">{players.map(player => <div key={player.id}><span>{player.id === me ? 'Tus casilleros' : player.name}</span><div>{a.objects.filter(o => o.owner === player.id).map(o => <button disabled={!active} aria-label={`${player.name}, casillero ${o.id % 6 + 1}, ${o.type ? 'cerrado' : 'abierto'}`} key={o.id} style={{ borderColor: player.id === me ? COLORS[0] : player.color }} className={o.type ? 'locker-closed' : ''} onClick={() => send({ key: 'select', target: o.id })}>{o.type ? '🔒' : '▯'}</button>)}</div></div>)}</div>
        : kind === 'lolly' ? <div className="lolly-race">{players.map(player => <div key={player.id}><div className="lollipop" style={{ transform: `scale(${Math.max(.08, 1 - a.players[player.id].progress / 110)})`, background: `repeating-conic-gradient(${player.color} 0 20deg, #fff 20deg 40deg)` }} /><b>{player.name}</b><progress max="100" value={a.players[player.id].progress} /></div>)}</div>
        : <>
          <svg className="arena-world" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <defs><pattern id="arena-grid" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#dbe8ee" stroke="#81979c" strokeWidth=".2" /></pattern></defs>
            {kind === 'paint' && <><rect width="100" height="100" fill="url(#arena-grid)" />{Object.entries(a.cells).map(([cell, id]) => { const [x, y] = cell.split(',').map(Number); return <rect key={cell} x={x * 10} y={y * 10} width="10" height="10" fill={owner(id)?.color} opacity=".8" />; })}</>}
            {kind === 'apartment_maze' && <>{MAZE.flatMap((row, y) => [...row].map((c, x) => <rect key={`${x},${y}`} x={x * 10} y={y * 12.5} width="10" height="12.5" fill={c === '#' ? '#263646' : '#e9cfa4'} stroke="#8c7358" strokeWidth=".2" />))}<text x="85" y="83" fill="#1e4c23" textAnchor="middle" fontSize="5">22</text><rect x="81" y="75" width="8" height="1" fill="#8a491e" /><rect x="51" y="37.5" width="8" height="1" fill="#8a491e" /></>}
            {kind === 'jumper' && <><ellipse cx="50" cy="56" rx="43" ry="34" fill="#c7a76a" stroke="#8f7042" strokeWidth="2" /><g transform={`rotate(${elapsed % 2600 / 2600 * 360} 50 56)`}><rect x="48" y="16" width="4" height="40" fill="#79889d" /><rect x="43" y="10" width="14" height="13" rx="2" fill="#d7e2eb" /></g></>}
            {kind === 'falling' && <><rect width="100" height="100" fill="#091d45" /><rect x={8 + 20 * Math.sin(elapsed / 1000 * .8)} y="86" width="34" height="5" fill="#78c9e4" /><rect x={58 + 15 * Math.cos(elapsed / 1000)} y="86" width="34" height="5" fill="#dc8ae8" /><text x="50" y={elapsed % 2600 / 2600 * 82} fontSize="9">💣</text></>}
            {(kind === 'escape' || kind === 'teetering') && <>{[0, 1, 2].map(i => <rect key={i} x={i * 100 / 3} width={100 / 3} height="100" fill={i === (a.event + a.seed + (kind === 'teetering' ? 1 : 0)) % 3 ? '#a44862' : '#153b44'} stroke="#ffffff22" strokeWidth=".4" />)}<text x={((a.event + a.seed + (kind === 'teetering' ? 1 : 0)) % 3 + .5) * 100 / 3} y="20" textAnchor="middle" fontSize="13">{kind === 'escape' ? '👀' : '🍌'}</text>{kind === 'teetering' && <rect x="5" y="86" width="90" height="7" rx="3" fill="#986c43" transform={`rotate(${Math.sin(elapsed / 1000 * 1.2) * 6} 50 86)`} />}</>}
            {(kind === 'escapeyo' || kind === 'pizza_pursuit') && <><rect y="86" width="100" height="14" fill="#4f7050" /><path d="M0 88H100" stroke="#ccdf98" strokeWidth="1" /><rect x={96 - elapsed % 2600 / 2600 * 96} y="72" width="6" height="14" fill="#d18842" /><text x="5" y="20" fontSize="5" fill="white">{kind === 'escapeyo' ? '¡Yo se acerca!' : 'Conserva tus pizzas'}</text></>}
            {kind === 'bouncybed' && <><rect x="4" y="87" width="92" height="8" rx="3" fill="#b07adf" /><text x="48" y="12" fontSize="8">🔔</text></>}
            {kind === 'airhockey' && <><path d="M3 5H97V94H3Z" fill="#d6edff" stroke="#5a91b8" strokeWidth="2" /><path d="M50 5V94M3 50H97" stroke="#ef5c6c" strokeWidth=".5" /><circle cx="50" cy="50" r="14" fill="none" stroke="#ef5c6c" strokeWidth=".5" />{players.map((player, i) => { const q = a.players[player.id]; return <rect key={player.id} x={i % 3 === 0 ? q.x - 12 : i % 3 === 1 ? 2 : 95} y={i % 3 === 0 ? 91 : q.x - 12} width={i % 3 === 0 ? 24 : 3} height={i % 3 === 0 ? 3 : 24} fill={player.color} />; })}<circle cx={a.objects[0].x} cy={a.objects[0].y} r="2.5" fill={owner(a.objects[0].owner)?.color ?? '#29263f'} /></>}
            {['catcher', 'king_of_the_heap'].includes(kind) && a.objects.filter(o => o.active && o.y >= 0).map(o => <text key={o.id} x={o.x} y={o.y} fontSize="7" textAnchor="middle" fill="#ffe88c">{kind === 'catcher' ? '♫' : '🗑'}</text>)}
            {kind === 'dodge' && players.map((player, i) => <g key={player.id}><path d={`M${(i + .5) * 100 / players.length} 95V83h7l-7 5`} stroke={player.color} fill={player.color} strokeWidth="1" /></g>)}
          </svg>
          {kind === 'dodge' && a.objects.filter(o => o.active && o.y >= 0 && o.y < 90).map(o => <button disabled={!active || o.owner !== me} aria-label={`${o.type === 0 ? 'Medusa naranja' : 'Medusa distractora'} hacia ${owner(o.owner)?.name}`} key={o.id} className={`arena-jelly${o.type === 1 ? ' jelly-decoy' : ''}`} style={{ left: `${(players.findIndex(p => p.id === o.owner) + .5) * 100 / players.length}%`, top: `${o.y}%` }} onClick={() => send({ key: 'select', target: o.id })}>♧</button>)}
          {kind !== 'airhockey' && players.map((player, i) => {
            const q = a.players[player.id];
            const x = kind === 'jumper' ? 50 + Math.cos(i / players.length * Math.PI * 2) * 35 : ['bouncybed', 'pizza_pursuit', 'escapeyo'].includes(kind) ? 12 + i * 76 / Math.max(1, players.length - 1) : q.x;
            const y = kind === 'jumper' ? 56 + Math.sin((i / players.length) * Math.PI * 2) * 28 : q.y;
            return <div key={player.id} className={`arena-player${q.alive ? '' : ' arena-eliminated'}${q.jumpUntil > now ? ' arena-jumping' : ''}`} style={{ left: `${x}%`, top: `${y}%`, borderColor: player.color }}><CharacterSprite id={player.avatar} state={!q.alive ? 'lose' : q.finishedAt !== null ? 'win' : q.jumpUntil > now ? 'jump' : now - q.lastInput < 250 ? 'walk' : 'idle'} label={player.name} /><small>{player.name}</small>{['dodge', 'pizza_pursuit', 'king_of_the_heap'].includes(kind) && <small>{'♥'.repeat(Math.max(0, q.lives))}</small>}</div>;
          })}
        </>}
      </div>
      <div className="arena-controls">
        {moveGames.includes(kind) && <div className="dpad">{([['left', '←'], ['up', '↑'], ['down', '↓'], ['right', '→']] as const).filter(([key]) => ['paint', 'apartment_maze'].includes(kind) || key === 'left' || key === 'right').map(([key, label]) => <button className="btn btn-secondary" disabled={!active} aria-label={`Mover ${key}`} key={key} {...hold(key)}>{label}</button>)}</div>}
        {jumpGames.includes(kind) && <button className="btn btn-primary" disabled={!active} {...hold('action')}>{kind === 'lolly' ? 'Lamer' : kind === 'bouncybed' ? 'Rebotar' : 'Saltar'} · Espacio</button>}
      </div>
    </>}
    <div className="mg-scores">{players.map(player => <span key={player.id} className={`mg-score${player.id === me ? ' mg-score-me' : ''}`} style={{ borderColor: player.color }}><CharacterAvatar id={player.avatar} className="mini-avatar" color={player.color} />{player.name}: <b>{mg.collected[player.id] ?? 0}</b>{a.players[player.id]?.alive ? '' : ' · fuera'}</span>)}</div>
  </section>;
}
