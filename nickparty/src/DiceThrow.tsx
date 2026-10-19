import { useEffect, useState } from 'react';
import type { RoomState } from '../shared/game';

const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export function DiceThrow({ state }: { state: RoomState }) {
  const roll = state.diceRoll;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (!roll) return;
    const timer = window.setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= roll.startedAt + roll.duration) window.clearInterval(timer);
    }, 50);
    return () => window.clearInterval(timer);
  }, [roll?.startedAt]);
  if (!roll || state.phase !== 'resolving' || state.dice === null || state.movement || now >= roll.startedAt + roll.duration) return null;
  const elapsed = Math.max(0, now - roll.startedAt);
  const rolling = elapsed < roll.duration * .65;
  const player = state.players[state.turn];
  return <div className={`dice-throw${rolling ? ' is-rolling' : ' is-revealed'}`} role="status" aria-label={rolling ? `${player?.name} está tirando` : `Resultado: ${state.dice}`}>
    <span className="dice-throw-name">{player?.name}</span>
    <div className="dice-throw-dice" aria-hidden="true">{roll.values.map((value, i) =>
      <span className="throw-die" key={i}>{FACES[rolling ? (Math.floor(elapsed / 65) + i * 2) % 6 : value - 1]}</span>
    )}</div>
    <strong>{rolling ? 'Tirando…' : `${state.dice} pasos`}</strong>
  </div>;
}
