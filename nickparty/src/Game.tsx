import { useEffect, useRef, useState } from 'react';
import type { RoomState } from '../shared/game';
import { DEFAULT_BOARD_THEME, STORE_ITEMS, tileIcon, tileLabel, type TriviaQuestion } from '../shared/game';
import { Board } from './Board';
import { GameAudio } from './GameAudio';
import { Minigame } from './Minigame';
import type { GameApi } from './useGame';
import { CharacterAvatar } from './CharacterAvatar';
import { CharacterSprite } from './CharacterSprite';

const LEGEND: Array<RoomState['board'][number]['type']> = [
  'red', 'blue', 'shop', 'goodBad', 'trivia', 'surprise', 'challenge', 'extraRoll',
];

export function Game({ api }: { api: GameApi }) {
  const state = api.state!;
  const me = api.me;
  const [cameraIntro, setCameraIntro] = useState(true);
  const turnPlayer = !['ended', 'minigame'].includes(state.phase) ? state.players[state.turn] : null;
  const isMyTurn = !!me && turnPlayer?.id === me;
  const canRoll = state.phase === 'playing' && isMyTurn && state.dice === null && !cameraIntro;

  return (
    <div className="game">
      <div className="game-main">
        <Board state={state} me={me} onChoosePath={api.choosePath} onIntroChange={setCameraIntro} />

        {state.phase === 'choosingPath' && state.pathChoice && <div className="path-panel" role="status">
          <strong>{isMyTurn ? 'Elige tu camino' : `${turnPlayer?.name} está eligiendo un camino`}</strong>
          <span>Quedan {state.pathChoice.remaining} pasos</span>
          {isMyTurn && <div>{state.pathChoice.options.map((target) => <button key={target} className="btn btn-primary" onClick={() => api.choosePath(target)}>
            Casilla {target + 1}: {tileLabel(state.board[target].type)}
          </button>)}</div>}
        </div>}
        {state.phase === 'resolving' && <div className="turn-banner" role="status">
          {state.movement ? `${turnPlayer?.name} avanza por el tablero` : state.dice !== null ? `${turnPlayer?.name} sacó ${state.dice}` : 'Resolviendo casilla…'}
        </div>}

        {state.phase === 'playing' && (
          <div className={`turn-banner${isMyTurn ? ' turn-mine' : ''}`}>
            {isMyTurn
              ? '🎲 ¡Es tu turno! Tira el dado'
              : turnPlayer
                ? `Turno de ${turnPlayer.name}`
                : 'Esperando…'}
          </div>
        )}

        {state.phase === 'minigame' && state.minigame && (
          <Minigame mg={state.minigame} players={state.players} me={me} onClaim={api.claim} onFlip={api.flipCard} onInput={api.miniInput} />
        )}

        {state.phase === 'store' && <StoreOverlay state={state} api={api} />}
        {state.phase === 'goldCoin' && <GoldCoinOverlay state={state} api={api} />}
        {state.phase === 'trivia' && state.trivia && <TriviaOverlay question={state.trivia.question} active={state.trivia.playerId === me} onAnswer={api.answerTrivia} />}

        {state.phase === 'ended' && <EndOverlay state={state} api={api} />}
      </div>

      <aside className="game-side">
        <GameAudio state={state} />
        <div className="card panel">
          <div className="panel-title">Jugadores</div>
          <ul className="score-list">
            {state.players.map((p) => (
              <li
                key={p.id}
                className={`score-row${p.id === api.me ? ' score-me' : ''}${
                  p.id === turnPlayer?.id ? ' score-turn' : ''
                }${p.connected ? '' : ' score-off'}`}
              >
                <CharacterAvatar id={p.avatar} className="score-avatar" color={p.color} />
                <span className="score-name">{p.name}</span>
                <span className="score-coins">🪙 {p.coins}</span>
                <span className="score-gold">⭐ {p.gold}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card panel inventory-panel">
          <div className="panel-title">Inventario</div>
          {state.players.find((p) => p.id === me)?.items.length ? state.players.find((p) => p.id === me)!.items.map((item, i) => {
            const definition = STORE_ITEMS.find((entry) => entry.id === item)!;
            const needsTarget = item === 'thief' || item === 'freeze' || item === 'block';
            const rivals = state.players.filter((p) => p.id !== me && p.connected);
            return <div className="inventory-item" key={`${item}-${i}`}>
              <span>{definition.name}</span>
              {needsTarget ? <select aria-label={`Objetivo para ${definition.name}`} id={`target-${i}`} defaultValue=""><option value="" disabled>Elige objetivo</option>{item === 'block' ? state.board.map((tile) => <option key={tile.i} value={tile.i}>{`Casilla ${tile.i + 1}`}</option>) : rivals.map((rival) => <option key={rival.id} value={rival.id}>{rival.name}</option>)}</select> : null}
              <button className="btn btn-secondary" disabled={!canRoll} onClick={() => {
                const targetId = needsTarget ? (document.getElementById(`target-${i}`) as HTMLSelectElement | null)?.value : undefined;
                api.useItem(item, targetId);
              }}>Usar</button>
            </div>;
          }) : <p className="waiting">Vacío. Compra objetos al caer en una tienda.</p>}
        </div>

        <div className="card panel dice-panel">
          <div className={`die${state.dice !== null ? ' die-roll' : ''}`}>
            {state.dice !== null ? state.dice : '🎲'}
          </div>
          <button className="btn btn-primary btn-lg" disabled={!canRoll} onClick={api.roll}>
            {state.phase === 'playing' ? (isMyTurn ? 'Tirar dado' : 'Espera tu turno') : '…'}
          </button>
        </div>

        <div className="card panel">
          <div className="panel-title">Últimos sucesos</div>
          <ul className="log-list">
            {state.log
              .slice(-6)
              .reverse()
              .map((line, i) => (
                <li key={`${state.version}-${i}`} className={i === 0 ? 'log-new' : ''}>
                  {line}
                </li>
              ))}
          </ul>
        </div>

        <div className="card panel legend">
          {LEGEND.map((t) => (
            <span key={t} className="legend-item">
              {tileIcon(t)} {tileLabel(t)}
            </span>
          ))}
        </div>

        <Chat api={api} />

        <button className="btn btn-ghost" onClick={api.leave}>
          Salir de la partida
        </button>
      </aside>
    </div>
  );
}

function StoreOverlay({ state, api }: { state: RoomState; api: GameApi }) {
  const player = state.players[state.turn];
  const active = player?.id === api.me;
  return <div className="mg-overlay shop-overlay"><section className="shop-card">
    <h2>Tienda</h2><p>{active ? `Tienes ${player.coins} monedas. Elige objetos para tu inventario.` : `${player?.name} está en la tienda.`}</p>
    <div className="shop-items">{STORE_ITEMS.map((item) => <article className="shop-item" key={item.id}><b>{item.name}</b><span>{item.description}</span><strong>{item.price} monedas</strong><button className="btn btn-secondary" disabled={!active || player.coins < item.price || player.items.length >= 3} onClick={() => api.buyItem(item.id)}>Comprar</button></article>)}</div>
    {active && <button className="btn btn-primary btn-lg" onClick={api.closeStore}>Terminar compra</button>}
  </section></div>;
}

function GoldCoinOverlay({ state, api }: { state: RoomState; api: GameApi }) {
  const player = state.players[state.turn];
  const active = player?.id === api.me;
  return <div className="mg-overlay shop-overlay"><section className="shop-card gold-offer"><h2>Moneda dorada</h2><p>{active ? `Cuesta 20 monedas azules. Tienes ${player.coins}.` : `${player?.name} llegó a la moneda dorada.`}</p>{active && <div className="gold-actions"><button className="btn btn-primary btn-lg" disabled={player.coins < 20} onClick={() => api.goldCoin(true)}>Comprar por 20</button><button className="btn btn-ghost" onClick={() => api.goldCoin(false)}>Dejarla</button></div>}</section></div>;
}

function TriviaOverlay({ question, active, onAnswer }: { question: TriviaQuestion; active: boolean; onAnswer: (index: number) => void }) {
  return <div className="mg-overlay trivia-overlay"><section className="shop-card"><h2>Trivia</h2><p>{question.question}</p><div className="trivia-answers">{question.answers.map((answer, index) => <button className="btn btn-secondary" key={`${answer.text}-${index}`} disabled={!active} onClick={() => onAnswer(index)}>{answer.text}</button>)}</div>{!active && <p className="waiting">El jugador activo está respondiendo…</p>}</section></div>;
}

function Chat({ api }: { api: GameApi }) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);
  const chat = api.state?.chat ?? [];

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    api.chat(t);
    setText('');
  };

  return (
    <div className="card panel">
      <div className="panel-title">Chat</div>
      <div className="chat-list" ref={listRef}>
        {chat.map((m) => (
          <div key={m.id} className="chat-msg">
            <b>{m.name}:</b> {m.text}
          </div>
        ))}
        {chat.length === 0 && <div className="chat-empty">Sin mensajes</div>}
      </div>
      <div className="chat-row">
        <input
          value={text}
          maxLength={120}
          placeholder="Mensaje…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button className="btn btn-secondary" onClick={send}>
          Enviar
        </button>
      </div>
    </div>
  );
}

function EndOverlay({ state, api }: { state: RoomState; api: GameApi }) {
  const winner = state.players.find((p) => p.id === state.winnerId);
  const me = state.players.find((p) => p.id === api.me);
  const isHost = !!me?.isHost;
  const ranking = [...state.players].sort((a, b) => b.gold - a.gold || b.coins - a.coins);

  return (
    <div className="mg-overlay end-overlay">
      <div className="end-card">
        <div className="end-title">🏆 Fin de la partida</div>
        <div className="end-winner">
          {winner ? `${winner.name} gana con ${winner.gold} monedas doradas` : 'Empate'}
        </div>
        {winner && <div className="winner-sprite"><CharacterSprite id={winner.avatar} state="win" label={winner.name} /></div>}
        <details className="bonus-summary" open>
          <summary>Bonificaciones finales</summary>
          <p>Una moneda dorada por categoría. Los empates comparten el premio; las categorías sin puntos no lo conceden.</p>
          <div className="bonus-table"><table><thead><tr><th>Jugador</th><th>Monedas en minijuegos</th><th>Casillas azules</th><th>Trivias acertadas</th></tr></thead><tbody>
            {state.players.map(player => <tr key={player.id}><th>{player.name}</th>{(['minigameCoins', 'blueSpaces', 'triviaCorrect'] as const).map(key => {
              const value = player.stats?.[key] ?? 0;
              const best = Math.max(...state.players.map(p => p.stats?.[key] ?? 0));
              return <td key={key}>{value}{value > 0 && value === best && <span aria-label="Una moneda dorada de bonificación"> 🥇</span>}</td>;
            })}</tr>)}
          </tbody></table></div>
        </details>
        <ol className="end-ranking">
          {ranking.map((p, i) => (
            <li key={p.id}>
              <span className="end-pos">{i + 1}</span>
              <CharacterAvatar id={p.avatar} className="score-avatar" color={p.color} />
              <span className="score-name">{p.name}</span>
              <span className="score-coins">🪙 {p.coins}</span>
              <span className="score-gold">⭐ {p.gold}</span>
            </li>
          ))}
        </ol>
        {isHost ? (
          <button
            className="btn btn-primary btn-lg"
            onClick={() => api.start(state.maxRounds, state.boardTheme ?? DEFAULT_BOARD_THEME, state.players.some((player) => player.isBot))}
          >
            Jugar otra vez
          </button>
        ) : (
          <p className="waiting">El anfitrión puede reiniciar la partida.</p>
        )}
        <button className="btn btn-ghost" onClick={api.leave}>
          Volver al inicio
        </button>
      </div>
    </div>
  );
}
