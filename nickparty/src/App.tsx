import { useEffect } from 'react';
import { Game } from './Game';
import { Home } from './Home';
import { Lobby } from './Lobby';
import { useGame } from './useGame';
import { sanitizeRoom } from '../shared/game';

const STATUS_TEXT: Record<string, string> = {
  connecting: 'Conectando…',
  online: 'En línea',
  offline: 'Reconectando…',
};

export function App() {
  const api = useGame();

  // Soporta enlaces de invitación: ...?sala=ABCD
  useEffect(() => {
    if (api.room) return;
    const code = sanitizeRoom(new URLSearchParams(location.search).get('sala') ?? '');
    if (code.length >= 3 && api.name.trim()) api.joinRoom(code);
    // Solo al montar / cuando cambian las dependencias relevantes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.name]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">🎉 Nicktoons Block Party Online</div>
        <div className={`net net-${api.status}`}>
          <span className="net-dot" />
          {STATUS_TEXT[api.status] ?? api.status}
        </div>
      </header>

      {api.error && (
        <div className="toast" onClick={api.clearError}>
          {api.error}
        </div>
      )}

      <main className="content">
        {!api.room ? (
          <Home api={api} />
        ) : !api.state ? (
          <div className="center">Entrando a la sala {api.room}…</div>
        ) : api.state.phase === 'lobby' ? (
          <Lobby api={api} />
        ) : (
          <Game api={api} />
        )}
      </main>

      <footer className="foot">
        1–8 jugadores · Elige tu camino y consigue monedas doradas
      </footer>
    </div>
  );
}
