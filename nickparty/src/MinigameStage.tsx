import { platformCenters, PLATFORM_HALF_WIDTH, platformFallOffset } from '../shared/platforms';
import { HockeyWorld } from './HockeyStage';
import type { CSSProperties } from 'react';
import type { MinigameState, PlayerState } from '../shared/game';
import { bedHeight, type OriginalMinigame } from '../shared/minigames';
import { jumpHeight, jumpProgress, spatulaTurn, runnerObstacle } from '../shared/minigame-physics';
import { OomWorld, OomPrompt } from './OomStage';
import { PartyWorld, PartyPrompt } from './PartyStages';
import { CharacterSprite } from './CharacterSprite';

export const art = (kind: string, name: string) => `/assets/minigames/${kind}/${name}.webp`;
const BACKGROUNDS = new Set(['paint', 'jumper', 'falling', 'escape', 'teetering', 'catcher', 'fleas', 'lockers', 'lolly', 'bouncybed', 'simon', 'airhockey', 'escapeyo', 'king_of_the_heap', 'apartment_maze', 'demanding_goat']);
export function OriginalBackdrop({ kind }: { kind: OriginalMinigame }) {
  return <div className={`original-backdrop backdrop-${kind}`} aria-hidden="true" style={BACKGROUNDS.has(kind) ? { backgroundImage: `url(${art(kind, 'background')})` } : undefined}>
    {kind === 'pizza_pursuit' && <><img className="sewer-pipe" src={art(kind, 'pipe')} alt="" /><img className="sewer-slime" src={art(kind, 'slime')} alt="" /></>}
  </div>;
}

export function MinigameStage({ mg, players, me, now }: { mg: MinigameState; players: PlayerState[]; me: string | null; now: number }) {
  const a = mg.arena!;
  const kind = mg.kind as OriginalMinigame;
  const elapsed = Math.max(0, now - mg.startsAt!);
  const spatula = spatulaTurn(elapsed);
  const cycle = elapsed % 2600 / 2600;
  const time = elapsed / 1000;
  const peers = players.filter(p => a.players[p.id]);
  const owner = (id: string) => peers.find(p => p.id === id);
  const hazardLane = (Math.floor(elapsed / 2600) + a.seed + (kind === 'teetering' ? 1 : 0)) % 3;
  const race = kind === 'escapeyo' || kind === 'pizza_pursuit';
  const obstacle = runnerObstacle(elapsed, a.seed);
  const localFirst = [...peers].sort((x, y) => Number(y.id === me) - Number(x.id === me));
  // Shared simulation coordinates are projected into a framed play area.
  const paintPoint = (x: number, y: number) => ({ x: 8 + x * .84, y: 24 + y * .64 });
  return <>
    {kind === 'jumper' && <div className="party-prompt">Velocidad ×{(3000 / spatula.span).toFixed(1)}</div>}
    {kind === 'escape' && <OomPrompt elapsed={elapsed} seed={a.seed} />}
    <PartyPrompt kind={kind} arena={a} elapsed={elapsed} />
    <svg className="arena-world" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <PartyWorld kind={kind} arena={a} elapsed={elapsed} />
      {kind === 'paint' && <>
        {Array.from({ length: 100 }, (_, cell) => { const x = cell % 10, y = Math.floor(cell / 10); const color = a.cells[`${x},${y}`]; return <rect key={cell} x={8 + x * 8.4} y={24 + y * 6.4} width="8.4" height="6.4" fill={color ? owner(color)?.color : '#d5f5e833'} stroke="#307f7f55" strokeWidth=".18" opacity={color ? .85 : 1} />; })}
      </>}
      {kind === 'apartment_maze' && a.maze && (() => {
        const maze = a.maze, w = 100 / maze.rows[0].length, h = 100 / maze.rows.length;
        return <>
          {maze.rows.flatMap((row, y) => [...row].map((c, x) => <g key={`${x},${y}`}><rect x={x*w} y={y*h} width={w} height={h} fill={c === '#' ? '#344758' : me && a.cells[`${me}:visited:${x},${y}`] ? '#d2dbc0' : '#adbaa7'} stroke="#203c4655" strokeWidth=".3" />{c === '#' && <path d={`M${x*w} ${y*h+h-1}h${w}`} stroke="#192e40" strokeWidth="1.5" />}</g>))}
          {maze.keys.map(([x,y], i) => !(me && a.cells[`${me}:key:${i}`]) && <g key={i} transform={`translate(${(x+.5)*w} ${(y+.5)*h})`}><circle r="1.4" fill="none" stroke="#fff1a0" strokeWidth=".8" /><path d="M1 1l2 2m-1-1l1-1" stroke="#fff1a0" strokeWidth=".8" /></g>)}
          <image href={art(kind, 'door')} x={maze.goal[0]*w} y={maze.goal[1]*h} width={w} height={h} preserveAspectRatio="xMidYMid meet" />
          <text x={(maze.goal[0]+.5)*w} y={(maze.goal[1]+.5)*h} fontSize="2.4" textAnchor="middle" fill="white" fontWeight="bold">22</text>
          {me && a.players[me] && elapsed > 2200 && maze.rows.flatMap((row, y) => [...row].map((_, x) => {
            const p = a.players[me]; const distance = Math.hypot(x+.5-p.x/w, y+.5-p.y/h);
            const seen = a.cells[`${me}:visited:${x},${y}`];
            return distance > 3.2 ? <rect key={`fog-${x}-${y}`} x={x*w} y={y*h} width={w+.05} height={h+.05} fill="#182c40" opacity={seen ? .45 : .96} /> : null;
          }))}
        </>;
      })()}
      {kind === 'jumper' && <g transform={`rotate(${spatula.phase * 360 + 180} 50 60)`}><image href={art(kind, 'spatula')} x="45" y="60" width="10" height="26" preserveAspectRatio="none" /></g>}
      {kind === 'falling' && <>
        {platformCenters(elapsed).map((x, i) => <image key={i} href={art(kind, 'platform')} x={x-PLATFORM_HALF_WIDTH} y="82" width={PLATFORM_HALF_WIDTH*2} height="12" preserveAspectRatio="none" />)}
      </>}
      {kind === 'escape' && <OomWorld elapsed={elapsed} seed={a.seed} />}
      {kind === 'teetering' && <>
        <rect x={hazardLane * 100 / 3} y="68" width={100/3} height="23" fill="#ff604a" opacity={cycle > .8 ? .4 : .12} />
        <g transform={`rotate(${Math.sin(time*1.2)*6} 50 82)`}><image href={art(kind, 'log')} x="5" y="82" width="90" height="13" /></g>
      </>}
      {race && <>
        {localFirst.map((player, i) => {
          const ground = i === 0 ? 88 : 18 + (i-1)*5;
          const x = kind === 'escapeyo' ? 15 + a.players[player.id].progress * .65 : 25;
          const obstacleX = x + (.82-obstacle.phase)*100;
          const height = obstacle.height * (i === 0 ? 1 : .45);
          return <g key={player.id}><path d={`M5 ${ground+1}H96`} stroke={player.color} strokeWidth=".4" strokeDasharray="1 1" opacity=".5" /><image href={art(kind, 'crate')} x={obstacleX-2.5} y={ground-height} width="5" height={height} preserveAspectRatio="none" /></g>;
        })}
        {kind === 'escapeyo' && <><path d="M83 29V92" stroke="#fff4c4" strokeWidth="1" strokeDasharray="2 2" /><image href={art(kind, 'yo')} x={Math.max(1, (time-6)*1.8*.65)} y="40" width="10" height="35" /></>}
      </>}
      {kind === 'bouncybed' && <g><path d="M46 9q0-9 4-9t4 9Z" fill="#ffda66" stroke="#ad7736" strokeWidth=".7" /><circle cx="50" cy="10" r="1" fill="#fff1be" /></g>}
      {kind === 'bouncybed' && <image href={art(kind, 'beds')} x="7" y="83" width="86" height="13" />}
      {kind === 'airhockey' && <HockeyWorld mg={mg} players={peers} me={me} />}
      {['catcher', 'king_of_the_heap'].includes(kind) && a.objects.filter(o => o.active && o.y >= 0).map(o => kind === 'catcher' ? <g key={o.id} transform={`translate(${o.x} ${o.y})`}><path d="M0 0v-7l4-1v6" fill="none" stroke={o.type ? '#ff6b72' : '#ffe178'} strokeWidth="1.2" /><ellipse cy="0" rx="1.5" ry="1" fill={o.type ? '#ff6b72' : '#ffe178'} /><ellipse cx="4" cy="-2" rx="1.5" ry="1" fill={o.type ? '#ff6b72' : '#ffe178'} /></g> : <image key={o.id} href={art(kind, 'garbage')} x={o.x-3} y={o.y-4} width="6" height="8" />)}
    </svg>
    {kind === 'paint' && <img className="paint-foreground" src={art(kind, 'foreground')} alt="" />}
    {kind === 'apartment_maze' && me && <div className="party-prompt"><b>Llaves {a.maze?.keys.filter((_, i) => a.cells[`${me}:key:${i}`]).length}/2 · salida 22</b></div>}
    {kind === 'bouncybed' && <span className={`bed-timing${elapsed%1000 < 160 || elapsed%1000 > 840 ? ' is-ready' : ''}`}>{elapsed%1000 < 160 || elapsed%1000 > 840 ? '¡Ahora!' : 'Espera al aterrizaje'}</span>}
    {kind !== 'airhockey' && kind !== 'dodge' && peers.map((player, i) => {
      const q = a.players[player.id]; const index = race ? localFirst.indexOf(player) : i;
      let { x, y } = q;
      if (kind === 'paint') ({ x, y } = paintPoint(x, y));
      if (kind === 'jumper') { x = 50 + Math.cos(i/peers.length*Math.PI*2)*26; y = 60 + Math.sin(i/peers.length*Math.PI*2)*26; }
      if (race) { x = kind === 'escapeyo' ? 15 + q.progress*.65 : 25; y = index === 0 ? 88 : 18 + (index-1)*5; }
      if (kind === 'signal_sprint') { x = 10 + q.progress*.76; y = 29 + i*8; }
      if (kind === 'bouncybed') { x = 12 + i*76/Math.max(1,peers.length-1); y = 82 - bedHeight(elapsed, q.progress); }
      if (kind === 'teetering') y = 82 + Math.sin(time*1.2)*6*(x-50)/50;
      if (kind === 'falling') y += platformFallOffset(q.fallStartedAt, now);
      const jumpOffset = jumpHeight(q, now) * (race && index > 0 ? .45 : 1);
      const bedPhase = elapsed % 1000 / 1000;
      const jumping = jumpOffset > 0 || kind === 'bouncybed' && bedPhase > .03 && bedPhase < .97;
      const size = kind === 'apartment_maze' ? 7 : race ? index === 0 ? 15 : 5 : kind === 'signal_sprint' ? 7 : 11;
      const feedback = now < (q.feedbackUntil ?? 0) ? q.feedback : null;
      return <div key={player.id} data-player={player.id} className={`arena-player${player.id===me ? ' arena-me' : ''}${!q.alive ? ' arena-eliminated' : ''}${feedback === 'hit' ? ' arena-hit' : ''}`} style={{ left: `${x}%`, top: `${y}%`, '--actor-size': `${size}cqh`, borderColor: player.color, zIndex: (player.id === me ? 110 : 10)+Math.round(y) } as CSSProperties}>
        <span className="arena-lift" data-jump-height={jumpOffset.toFixed(2)} style={{ transform: `translateY(${-jumpOffset}cqh)` }}><CharacterSprite id={player.avatar} state={!q.alive ? 'lose' : q.finishedAt !== null ? 'win' : jumping ? 'jump' : race || now-q.lastInput < 220 ? 'walk' : 'idle'} progress={jumping ? kind === 'bouncybed' ? bedPhase : jumpProgress(q, now) : undefined} label={player.name} /></span>
        {player.id === me && feedback && <span className={`arena-feedback feedback-${feedback}`} role="status">{feedback === 'hit' ? '¡Golpe!' : feedback === 'perfect' ? '¡Perfecto!' : race ? '¡Salto limpio!' : ['escape','jumper'].includes(kind) ? '¡Esquivado!' : '+ Puntos'}</span>}
        <small>{player.id===me ? 'TÚ' : player.name}</small>
      </div>;
    })}
    {['pizza_pursuit', 'king_of_the_heap', 'escapeyo'].includes(kind) && me && a.players[me] && <div className="mini-progress"><span>{kind==='pizza_pursuit' ? `${a.players[me].lives} pizzas` : `${Math.floor(a.players[me].progress)}%`}</span><progress max="100" value={a.players[me].progress} /></div>}
  </>;
}
