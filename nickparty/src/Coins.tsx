import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { PlayerState } from '../shared/game';

export function Coin({ gold = false, className = '' }: { gold?: boolean; className?: string }) {
  return <span className={`coin-sprite ${gold ? 'coin-gold' : 'coin-blue'} ${className}`} aria-hidden="true" />;
}

export interface CoinChange { id: string; playerId: string; coins: number; gold: number; at: number }
export function useCoinChanges(players: PlayerState[], roomId: string) {
  const previous = useRef({ roomId, balances: new Map(players.map(p => [p.id, { coins: p.coins, gold: p.gold }])) });
  const [changes, setChanges] = useState<CoinChange[]>([]);
  useEffect(() => {
    const old = previous.current;
    previous.current = { roomId, balances: new Map(players.map(p => [p.id, { coins: p.coins, gold: p.gold }])) };
    if (old.roomId !== roomId) { setChanges([]); return; }
    const at = Date.now();
    const fresh = players.flatMap(p => {
      const before = old.balances.get(p.id);
      if (!before || before.coins === p.coins && before.gold === p.gold) return [];
      return [{ id: `${p.id}-${at}-${p.coins}-${p.gold}`, playerId: p.id, coins: p.coins - before.coins, gold: p.gold - before.gold, at }];
    });
    if (fresh.length) setChanges(current => [...current.filter(c => at - c.at < 2200), ...fresh]);
  }, [players, roomId]);
  useEffect(() => {
    if (!changes.length) return;
    const timer = window.setTimeout(() => setChanges(current => current.filter(c => Date.now() - c.at < 2200)), Math.max(20, 2205 - (Date.now() - changes[0].at)));
    return () => window.clearTimeout(timer);
  }, [changes]);
  return changes;
}

export function CoinBurst({ amount, gold = false }: { amount: number; gold?: boolean }) {
  const loss = amount < 0;
  return <span className={`coin-burst${loss ? ' coin-loss' : ''}`} role="status" aria-label={`${amount > 0 ? '+' : ''}${amount} monedas${gold ? ' doradas' : ''}`}>
    {Array.from({ length: Math.min(7, Math.abs(amount)) }, (_, i) => <span className="coin-particle" key={i} style={{ '--coin-x': `${(i - Math.min(6, Math.abs(amount)-1) / 2) * 14}px`, '--coin-delay': `${i * 55}ms` } as CSSProperties}><Coin gold={gold} /></span>)}
    <strong>{amount > 0 ? '+' : ''}{amount}</strong>
  </span>;
}

export function CoinBalance({ value, gold = false }: { value: number; gold?: boolean }) {
  const [displayed, setDisplayed] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    const from = current.current;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { current.current = value; setDisplayed(value); return; }
    const started = performance.now(); let frame = 0;
    const tick = (time: number) => {
      const progress = Math.max(0, Math.min(1, (time - started) / 650));
      current.current = Math.round(from + (value - from) * (1 - (1-progress) ** 3));
      setDisplayed(current.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <span className="coin-balance" aria-label={`${value} monedas${gold ? ' doradas' : ''}`}><Coin gold={gold} /><span aria-hidden="true">{displayed}</span></span>;
}
