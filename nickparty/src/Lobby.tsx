import { useState } from 'react';
import { BOARD_THEMES, DEFAULT_BOARD_THEME, DEFAULT_ROUNDS, MAX_PLAYERS, ROUND_OPTIONS } from '../shared/game';
import type { BoardThemeId } from '../shared/game';
import type { GameApi } from './useGame';
import { CharacterAvatar } from './CharacterAvatar';

function codeToUrl(code: string): string {
  const url = new URL(location.href);
  url.searchParams.set('sala', code);
  return url.toString();
}

export function Lobby({ api }: { api: GameApi }) {
  const state = api.state!;
  const [rounds, setRounds] = useState<number>(DEFAULT_ROUNDS);
  const [boardTheme, setBoardTheme] = useState<BoardThemeId>(state.boardTheme ?? DEFAULT_BOARD_THEME);
  const [copied, setCopied] = useState(false);
  const [withCpu, setWithCpu] = useState(false);
  const me = state.players.find((p) => p.id === api.me);
  const isHost = !!me?.isHost;
  const connected = state.players.filter((p) => p.connected).length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codeToUrl(state.id));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="lobby">
      <div className="card lobby-card">
        <div className="lobby-code-label">Código de sala</div>
        <div className="lobby-code">{state.id}</div>
        <button className="btn btn-secondary" onClick={copy}>
          {copied ? '¡Enlace copiado!' : 'Copiar enlace de invitación'}
        </button>

        {isHost && (
          <div className="field board-theme-field">
            <span>Elige el tablero</span>
            <div className="board-theme-grid">
              {BOARD_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  className={`board-theme${boardTheme === theme.id ? ' active' : ''}`}
                  style={{ backgroundImage: `url(/assets/boards/${theme.file})` }}
                  onClick={() => setBoardTheme(theme.id)}
                  aria-pressed={boardTheme === theme.id}
                >
                  <span>{theme.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <h3 className="lobby-players-title">
          Jugadores ({connected}/{8}){connected < 2 && !withCpu ? ' - falta rival o activa CPU' : ''}
        </h3>
        <ul className="player-list">
          {state.players.map((p) => (
            <li key={p.id} className={`player-row${p.connected ? '' : ' player-off'}`}>
              <CharacterAvatar id={p.avatar} className="player-avatar" color={p.color} />
              <span className="player-name">
                {p.name}
                {p.id === api.me ? ' (tú)' : ''}
              </span>
              {p.isHost && <span className="tag">anfitrión</span>}
              {p.isBot && <span className="tag">CPU</span>}
              {!p.connected && <span className="tag tag-off">desconectado</span>}
            </li>
          ))}
          {state.players.length === 0 && <li className="player-empty">Esperando jugadores…</li>}
          {Array.from({ length: Math.max(0, MAX_PLAYERS - state.players.length) }, (_, index) => <li className="player-row player-slot" key={`slot-${index}`}><span className="slot-number">{state.players.length + index + 1}</span><span>Plaza disponible</span></li>)}
        </ul>

        {isHost ? (
          <>
            <div className="field">
              <span>Duración</span>
              <div className="rounds-row">
                {ROUND_OPTIONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`round-btn${rounds === r ? ' active' : ''}`}
                    onClick={() => setRounds(r)}
                  >
                    {r} rondas
                  </button>
                ))}
              </div>
            </div>
            <label className="cpu-toggle"><input type="checkbox" checked={withCpu} onChange={(event) => setWithCpu(event.target.checked)} /> Jugar contra CPU</label>
            <button
              className="btn btn-primary btn-lg"
              disabled={connected < 2 && !withCpu}
              onClick={() => api.start(rounds, boardTheme, withCpu)}
            >
              {withCpu ? 'Jugar contra CPU' : 'Iniciar partida'}
            </button>
          </>
        ) : (
          <p className="waiting">Esperando a que el anfitrión inicie la partida…</p>
        )}

        <button className="btn btn-ghost" onClick={api.leave}>
          Salir de la sala
        </button>
      </div>
    </div>
  );
}
