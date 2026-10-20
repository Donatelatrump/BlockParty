import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BOARD_PATHS, pathPoint } from '../shared/board-paths';
import type { RoomState } from '../shared/game';
import { BOARD_THEMES, boardPathPos, tileIcon, tileLabel } from '../shared/game';
import { CharacterSprite } from './CharacterSprite';
import { DiceThrow } from './DiceThrow';
import { Coin, CoinBurst, useCoinChanges } from './Coins';

interface Props {
  state: RoomState;
  me: string | null;
  onChoosePath: (target: number) => void;
  onIntroChange: (active: boolean) => void;
  onRoll: () => void;
  canRoll: boolean;
}

const PLAY_ZOOM = 2.35;

export function Board({ state, me, onChoosePath, onIntroChange, onRoll, canRoll }: Props) {
  const coinChanges = useCoinChanges(state.players, state.id);
  const [zoom, setZoom] = useState(PLAY_ZOOM);
  const [following, setFollowing] = useState(true);
  const [touring, setTouring] = useState(true);
  const tourFrame = useRef(0);
  const tourCancelled = useRef(false);
  const latest = useRef(state);
  latest.current = state;
  const finishTour = () => {
    tourCancelled.current = true;
    cancelAnimationFrame(tourFrame.current);
    setTouring(false);
    onIntroChange(false);
  };
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ x: number; y: number; distance: number } | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const changeZoom = (value: number, clientX?: number, clientY?: number) => {
    const el = viewport.current;
    const next = Math.max(1, Math.min(4, Math.round(value * 100) / 100));
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clientX === undefined ? el.clientWidth / 2 : clientX - rect.left;
    const y = clientY === undefined ? el.clientHeight / 2 : clientY - rect.top;
    const ratio = next / zoomRef.current;
    const left = (el.scrollLeft + x) * ratio - x;
    const top = (el.scrollTop + y) * ratio - y;
    zoomRef.current = next;
    setZoom(next);
    requestAnimationFrame(() => el.scrollTo(left, top));
  };
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      finishTour();
      setFollowing(false);
      changeZoom(zoomRef.current * Math.exp(-event.deltaY * .0015), event.clientX, event.clientY);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);
  const viewport = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!state.movement) return;
    let frame = 0;
    const tick = () => { setNow(Date.now()); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state.movement]);
  const theme = BOARD_THEMES.find((item) => item.id === state.boardTheme) ?? BOARD_THEMES[0];
  useLayoutEffect(() => {
    const element = viewport.current;
    const player = latest.current.players[latest.current.turn];
    if (!element || !player) return;
    const pos = boardPathPos(theme.id, player.pos);
    element.scrollTo(pos.x / 100 * element.scrollWidth - element.clientWidth / 2, pos.y / 100 * element.scrollHeight - element.clientHeight / 2);
  }, [theme.id, state.id]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    tourCancelled.current = false;
    let disposed = false;
    setTouring(true);
    onIntroChange(true);
    // Decoding or a throttled animation frame must never lock the first turn.
    const tourDeadline = window.setTimeout(finishTour, 8500);
    const center = (point: { x: number; y: number }) => element.scrollTo({
      left: point.x / 100 * element.scrollWidth - element.clientWidth / 2,
      top: point.y / 100 * element.scrollHeight - element.clientHeight / 2,
      behavior: 'instant',
    });
    const currentPlayer = () => {
      const current = latest.current;
      return boardPathPos(theme.id, current.players[current.turn]?.pos ?? 0);
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      center(currentPlayer()); finishTour(); window.clearTimeout(tourDeadline); return;
    }
    const nodes = BOARD_PATHS[theme.id].nodes;
    const minX = Math.min(...nodes.map(p => p.x)), maxX = Math.max(...nodes.map(p => p.x));
    const minY = Math.min(...nodes.map(p => p.y)), maxY = Math.max(...nodes.map(p => p.y));
    const corners = [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }];
    const start = currentPlayer();
    const stops = [start, ...corners.map(corner => nodes.reduce((best, p) => Math.hypot(p.x - corner.x, p.y - corner.y) < Math.hypot(best.x - corner.x, best.y - corner.y) ? p : best, nodes[0])), start];
    // Interpolate attainable scroll positions to avoid pauses at the map edges.
    const toScroll = (p: { x: number; y: number }) => ({
      x: Math.max(0, Math.min(element.scrollWidth - element.clientWidth, p.x / 100 * element.scrollWidth - element.clientWidth / 2)),
      y: Math.max(0, Math.min(element.scrollHeight - element.clientHeight, p.y / 100 * element.scrollHeight - element.clientHeight / 2)),
    });
    const image = new Image();
    image.src = `/assets/boards/${theme.file}`;
    void image.decode().then(() => {
      if (disposed || tourCancelled.current) return;
      const anchors = stops.map(toScroll);
      const started = performance.now();
      const animate = (time: number) => {
        if (disposed || tourCancelled.current) return;
        // A frame timestamp can precede the decode callback within the same frame.
        const progress = Math.max(0, Math.min(anchors.length - 1, (time - started) / 1200));
        const segment = Math.min(anchors.length - 2, Math.floor(progress));
        const t = progress - segment;
        const eased = t * t * (3 - 2 * t);
        const from = anchors[segment], to = anchors[segment + 1];
        element.scrollTo({ left: from.x + (to.x - from.x) * eased, top: from.y + (to.y - from.y) * eased, behavior: 'instant' });
        if (progress >= anchors.length - 1) { center(currentPlayer()); finishTour(); }
        else tourFrame.current = requestAnimationFrame(animate);
      };
      tourFrame.current = requestAnimationFrame(animate);
    }).catch(() => { if (!disposed && !tourCancelled.current) finishTour(); });
    return () => { disposed = true; window.clearTimeout(tourDeadline); tourCancelled.current = true; cancelAnimationFrame(tourFrame.current); };
  }, [theme.id, state.id, onIntroChange]);

  useEffect(() => {
    if (touring && (state.phase !== 'playing' || state.movement)) finishTour();
  }, [state.phase, state.movement, touring]);
  const offsets = useMemo(() => {
    const groups = new Map<number, string[]>();
    for (const p of state.players) {
      const arr = groups.get(p.pos) ?? [];
      arr.push(p.id);
      groups.set(p.pos, arr);
    }
    const map = new Map<string, { dx: number; dy: number }>();
    for (const ids of groups.values()) {
      ids.forEach((id, i) => {
        const angle = (i / ids.length) * Math.PI * 2 + Math.PI / 4;
        const radius = ids.length > 3 ? 1.25 : ids.length > 1 ? .7 : 0;
        map.set(id, { dx: Math.cos(angle) * radius, dy: Math.sin(angle) * radius });
      });
    }
    return map;
  }, [state.players]);

  const turnId = !['lobby', 'ended', 'minigame'].includes(state.phase) ? (state.players[state.turn]?.id ?? null) : null;
  useEffect(() => {
    const element = viewport.current;
    const player = state.players[state.turn];
    if (!element || !player || zoom === 1 || !following || touring) return;
    const move = state.movement;
    const point = move ? pathPoint(theme.id, move.from, move.to, (now - move.startedAt) / move.duration) : boardPathPos(theme.id, player.pos);
    element.scrollTo({ left: point.x / 100 * element.scrollWidth - element.clientWidth / 2, top: point.y / 100 * element.scrollHeight - element.clientHeight / 2, behavior: move || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [now, state.movement, state.players, state.turn, theme.id, zoom, following, touring]);

  return (
    <>
    <div className="board-controls">
      <button className="btn btn-secondary" onClick={() => { finishTour(); setFollowing(false); changeZoom(1); }}>Mapa completo</button>
      <button className={`btn ${following ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={following} onClick={() => { finishTour(); setFollowing(!following); if (!following && zoom === 1) changeZoom(PLAY_ZOOM); }}>Seguir turno</button>
      <button className="btn btn-secondary" aria-label="Alejar tablero" disabled={zoom <= 1} onClick={() => { finishTour(); changeZoom(zoom - .25); }}>-</button>
      <label className="zoom-control">Zoom <input aria-label="Zoom del tablero" type="range" min="1" max="4" step=".05" value={zoom} onChange={(e) => { finishTour(); changeZoom(Number(e.target.value)); }} /></label>
      <output aria-live="polite">{Math.round(zoom * 100)}%</output>
      <button className="btn btn-secondary" aria-label="Acercar tablero" disabled={zoom >= 4} onClick={() => { finishTour(); changeZoom(zoom + .25); }}>+</button>
      <span>{theme.name} · {state.board.length} casillas</span>
    </div>
    <div className="board-stage">
    <DiceThrow state={state} />
    {canRoll && <button className="board-roll" onClick={onRoll} aria-label="Tirar dado"><span aria-hidden="true">⚄</span><strong>Tirar dado</strong><small>Tu turno</small></button>}
    {touring && <div className="board-tour" role="status"><span>Explorando {theme.name}…</span><button className="btn btn-secondary" onClick={finishTour}>Ir al jugador</button></div>}
    <div className="board-caption"><strong>{theme.name}</strong><span>Ronda {Math.max(1, state.round)}/{state.maxRounds}</span></div>
    <div className="board-viewport" ref={viewport}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        finishTour();
        e.currentTarget.setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        gesture.current = null;
      }}
      onPointerMove={(e) => {
        if (!pointers.current.has(e.pointerId)) return;
        const prev = pointers.current.get(e.pointerId)!;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        setFollowing(false);
        const points = [...pointers.current.values()];
        if (points.length === 2) {
          const [a, b] = points;
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          if (gesture.current) changeZoom(zoomRef.current * distance / gesture.current.distance, (a.x + b.x) / 2, (a.y + b.y) / 2);
          gesture.current = { x: 0, y: 0, distance: Math.max(1, distance) };
        } else { e.currentTarget.scrollLeft -= e.clientX - prev.x; e.currentTarget.scrollTop -= e.clientY - prev.y; }
      }}
      onPointerUp={(e) => { pointers.current.delete(e.pointerId); gesture.current = null; }}
      onPointerCancel={(e) => { pointers.current.delete(e.pointerId); gesture.current = null; }}
      >
    <div
      className={`board board-${theme.id}`}
      style={{
        width: `${zoom * 100}%`,
        aspectRatio: `${theme.imageWidth} / ${theme.imageHeight}`,
        backgroundImage: `linear-gradient(rgba(8, 9, 24, .08), rgba(8, 9, 24, .18)), url(/assets/boards/${theme.file})`,
        backgroundSize: '100% 100%',
      }}
      aria-label={`Tablero ${theme.name}`}
    >
      {state.board.map((t) => {
        const pos = boardPathPos(theme.id, t.i, state.board.length);
        return (
          <div
            key={t.i}
            className={`tile tile-${t.type}${state.players[state.turn]?.pos === t.i ? ' tile-current' : ''}${state.blockedTiles.includes(t.i) ? ' tile-blocked' : ''}`}
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            title={`Casilla ${t.i + 1} · ${tileLabel(t.type)}`}
          >
            <span className="tile-icon">{tileIcon(t.type)}</span>
          </div>
        );
      })}

      <svg className="board-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {Object.entries(BOARD_PATHS[theme.id].edges).map(([key, points]) => <polyline key={key} points={points.map((p) => `${p.x},${p.y}`).join(' ')} />)}
      </svg>

      {(() => {
        const pos = boardPathPos(theme.id, state.goldCoinPos, state.board.length);
        return <div className="gold-coin-marker" style={{ left: `${pos.x}%`, top: `${pos.y}%` }} title="Moneda dorada: 20 monedas"><Coin gold /></div>;
      })()}

      {state.players.map((p) => {
        const movement = state.movement?.playerId === p.id ? state.movement : null;
        const pos = movement ? pathPoint(theme.id, movement.from, movement.to, (now - movement.startedAt) / movement.duration) : boardPathPos(theme.id, p.pos, state.board.length);
        const off = offsets.get(p.id) ?? { dx: 0, dy: 0 };
        const classes = [
          'token', 'token-sprite',
          p.id === me ? 'token-me' : '',
          p.id === turnId ? 'token-turn' : '',
          p.connected ? '' : 'token-off',
          movement ? 'token-moving' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <div
            key={p.id}
            className={classes}
            style={{
              left: `${pos.x + (movement ? 0 : off.dx)}%`,
              top: `${pos.y + (movement ? 0 : off.dy)}%`,
              background: p.color,
              zIndex: Math.round(pos.y * 10) + 10,
            }}
            title={`${p.name} · ${p.coins} monedas · ${p.gold} estrellas`}
          >
            <CharacterSprite id={p.avatar} state={movement ? 'walk' : p.frozenTurns > 0 ? 'hurt' : 'idle'} facing={movement && boardPathPos(theme.id, movement.to).y < boardPathPos(theme.id, movement.from).y ? 'NE' : 'SE'} flip={!!movement && boardPathPos(theme.id, movement.to).x < boardPathPos(theme.id, movement.from).x} label={p.name} />
            <span className="token-name">{p.name}</span>
            {coinChanges.filter(change => change.playerId === p.id).map(change => <span className="token-coins" key={change.id}>
              {change.coins !== 0 && <CoinBurst amount={change.coins} />}
              {change.gold !== 0 && <CoinBurst amount={change.gold} gold />}
            </span>)}
          </div>
        );
      })}

      {state.pathChoice?.options.map((target) => {
        const pos = boardPathPos(theme.id, target);
        return <button key={target} className="path-choice" style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
          disabled={state.pathChoice?.playerId !== me} onClick={() => onChoosePath(target)}
          aria-label={`Elegir camino hacia casilla ${target + 1}: ${tileLabel(state.board[target].type)}`}>
          <span>➜</span> {target + 1}
        </button>;
      })}

    </div>
    </div>
    </div>
    </>
  );
}
