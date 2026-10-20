import type { ArenaState, OriginalMinigame } from '../shared/minigames';
import { signalPhase, tileRound, TILE_COLORS } from '../shared/minigame-physics';

export function PartyWorld({ kind, arena, elapsed }: { kind: OriginalMinigame; arena: ArenaState; elapsed: number }) {
  if (kind === 'color_crumble') {
    const round = tileRound(elapsed, arena.seed);
    return <>{Array.from({ length: 20 }, (_, i) => {
      const fallen = round.dropping && round.color(i) !== round.target;
      return <g key={`${round.round}-${i}`} className={fallen ? 'island-fallen' : 'island-tile'}>
        <rect x={i % 5 * 20 + 1} y={Math.floor(i / 5) * 25 + 2} width="18" height="22" rx="2" fill={fallen ? '#10243c' : TILE_COLORS[round.color(i)]} stroke={fallen ? '#19324a' : '#fff4cd'} strokeWidth=".6" />
        {!fallen && <text x={i % 5 * 20 + 10} y={Math.floor(i / 5) * 25 + 16} textAnchor="middle" fill="#17354a" fontSize="6" fontWeight="900">{['●', '◆', '▲', '★'][round.color(i)]}</text>}
      </g>;
    })}</>;
  }
  if (kind === 'coin_scramble') return <>
    <defs><pattern id="treasure-floor" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#176e79" /><path d="M0 0H10V10" fill="none" stroke="#43b4b0" strokeWidth=".35" /></pattern></defs>
    <rect width="100" height="100" fill="url(#treasure-floor)" />
    <circle cx="50" cy="50" r="5" fill="#293c68" stroke="#f78878" strokeWidth="1" />
    <circle cx="50" cy="50" r={elapsed % 4000 / 4000 * 90} fill="none" stroke="#ffad67" strokeWidth="2" opacity=".85" />
    {arena.objects.filter(o => o.active).map(o => <g key={o.id} transform={`translate(${o.x} ${o.y})`}><ellipse cy="2" rx="3" ry="1" fill="#103f5366" /><circle r="2.6" fill={o.type ? '#ffcd47' : '#89e6ff'} stroke="#fff4cd" strokeWidth=".6" /><text y="1" textAnchor="middle" fontSize="3" fill="#39527a" fontWeight="900">{o.type ? 3 : 1}</text></g>)}
  </>;
  if (kind === 'signal_sprint') return <>
    <rect width="100" height="100" fill="#4c9278" />
    <path d="M6 20H94V92H6Z" fill="#426678" stroke="#c3e9c0" strokeWidth="1" />
    {Array.from({ length: 8 }, (_, i) => <path key={i} d={`M6 ${25 + i * 8}H94`} stroke="#b4e6e066" strokeWidth=".4" strokeDasharray="2 1" />)}
    <path d="M86 20V92" stroke="white" strokeWidth="2" strokeDasharray="3 3" />
    <rect x="42" y="2" width="16" height="12" rx="3" fill="#21364d" />
    {(['go', 'warning', 'stop'] as const).map((phase, i) => <circle key={phase} cx={46 + i * 4} cy="8" r="1.5" fill={signalPhase(elapsed, arena.seed) === phase ? ['#a8f276', '#ffdc70', '#ff786c'][i] : '#142734'} />)}
  </>;
  return null;
}

export function PartyPrompt({ kind, arena, elapsed }: { kind: OriginalMinigame; arena: ArenaState; elapsed: number }) {
  if (kind === 'color_crumble') {
    const round = tileRound(elapsed, arena.seed);
    return <div className="party-prompt" style={{ borderColor: TILE_COLORS[round.target] }}><b style={{ color: TILE_COLORS[round.target] }}>{['● Naranja', '◆ Azul', '▲ Verde', '★ Violeta'][round.target]}</b><span>{round.dropping ? '¡El suelo cae!' : `${(round.remaining / 1000).toFixed(1)} s`}</span></div>;
  }
  if (kind === 'signal_sprint') {
    const phase = signalPhase(elapsed, arena.seed);
    return <div className={`party-prompt signal-${phase}`}><b>{phase === 'go' ? 'CORRE' : phase === 'warning' ? 'SUELTA EL CONTROL' : 'QUIETO'}</b></div>;
  }
  if (kind === 'coin_scramble') return <div className="party-prompt"><b>Recoge monedas · salta la onda</b></div>;
  return null;
}
