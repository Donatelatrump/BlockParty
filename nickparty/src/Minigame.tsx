import { OriginalMinigameView } from './OriginalMinigame';
import type { MiniInput } from '../shared/minigames';
import { useEffect, useState } from 'react';
import type { MinigameState, PlayerState } from '../shared/game';
import { MINIGAME_DURATION_MS } from '../shared/game';
import { CharacterAvatar } from './CharacterAvatar';

interface Props {
  mg: MinigameState;
  players: PlayerState[];
  me: string | null;
  onClaim: (coinId: number) => void;
  onFlip: (cardId: number) => void;
  onInput: (input: MiniInput) => void;
}

export function Minigame(props: Props) {
  return props.mg.arena ? <OriginalMinigameView mg={props.mg} players={props.players} me={props.me} onInput={props.onInput} /> : <LegacyMinigame {...props} />;
}
function LegacyMinigame({ mg, players, me, onClaim, onFlip }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [taken, setTaken] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    setTaken(new Set());
  }, [mg.id]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);

  const remaining = Math.max(0, mg.endsAt - now);
  const pct = Math.max(0, Math.min(100, (remaining / MINIGAME_DURATION_MS) * 100));

  return (
    <div className="mg-overlay">
      <div className="mg-bar">
        <div className="mg-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="mg-head">
        <span className="mg-title">🪙 {mg.name}</span>
        <span className="mg-timer">{(remaining / 1000).toFixed(1)}s</span>
      </div>
      <p className="mg-desc">{mg.desc}</p>

      <div className={`mg-field${mg.kind === 'whack' ? ' mg-field-whack' : ''}`}>
        {mg.kind === 'memory' ? mg.cards.map((face, index) => {
          const visible = mg.matched.includes(index) || mg.revealed.includes(index);
          return <button key={index} type="button" className={`mg-card${visible ? ' mg-card-open' : ''}`} disabled={remaining <= 0 || visible || mg.revealed.length >= 2} onClick={() => onFlip(index)}>
            {visible ? ['A', 'B', 'C', 'D', 'E', 'F'][face] : '?'}
          </button>;
        }) : mg.coins.map((c) => {
          if (now < (c.appearsAt ?? 0) || now >= (c.expiresAt ?? Infinity)) return null;
          const claimed = c.by !== null || taken.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              className={`mg-coin${claimed ? ' mg-coin-taken' : ''}`}
              style={{ left: `${c.x}%`, top: `${c.y}%` }}
              disabled={claimed || remaining <= 0}
              onPointerDown={() => {
                if (claimed) return;
                setTaken((prev) => new Set(prev).add(c.id));
                onClaim(c.id);
              }}
            >
              {mg.kind === 'whack' ? '\u{1FABC}' : c.value > 1 ? '2' : '1'}
            </button>
          );
        })}
      </div>

      <div className="mg-scores">
        {players.map((p) => (
          <span
            key={p.id}
            className={`mg-score${p.id === me ? ' mg-score-me' : ''}`}
            style={{ borderColor: p.color }}
          >
            <CharacterAvatar id={p.avatar} className="mini-avatar" color={p.color} /> {p.name}: <b>{mg.collected[p.id] ?? 0}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
