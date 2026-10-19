import { useState } from 'react';
import { AVATARS, CHARACTERS, MAX_PLAYERS, sanitizeRoom } from '../shared/game';
import type { GameApi } from './useGame';
import { CharacterAvatar } from './CharacterAvatar';

export function Home({ api }: { api: GameApi }) {
  const [code, setCode] = useState('');
  const ready = api.name.trim().length > 0;

  const join = () => {
    if (!ready) return;
    api.joinRoom(code);
  };

  return (
    <div className="home">
      <h1 className="home-title">
        Nicktoons <span>Block Party</span>
      </h1>
      <p className="home-sub">
        Mapas y personajes originales recreados en HTML5 para <b>1-{MAX_PLAYERS}</b> jugadores.
      </p>

      <div className="card">
        <label className="field">
          <span>Tu nombre</span>
          <input
            value={api.name}
            maxLength={14}
            placeholder="Escribe tu nombre"
            onChange={(e) => api.setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && join()}
          />
        </label>

        <div className="field">
          <span>Elige tu personaje</span>
          <div className="avatar-grid">
            {AVATARS.map((a) => (
              <button
                key={a}
                type="button"
                className={`avatar-btn${api.avatar === a ? ' active' : ''}`}
                onClick={() => api.setAvatar(a)}
                aria-label={CHARACTERS.find((character) => character.id === a)?.name ?? a}
                title={CHARACTERS.find((character) => character.id === a)?.name ?? a}
              >
                <CharacterAvatar id={a} className="avatar-art" />
              </button>
            ))}
          </div>
        </div>

        <button className="btn btn-primary btn-lg" disabled={!ready} onClick={() => api.joinRoom('')}>
          Crear sala nueva
        </button>

        <div className="or">o únete con un código</div>

        <div className="join-row">
          <input
            className="code-input"
            value={code}
            placeholder="ABCD"
            maxLength={5}
            onChange={(e) => setCode(sanitizeRoom(e.target.value))}
            onKeyDown={(e) => e.key === 'Enter' && join()}
          />
          <button className="btn btn-secondary" disabled={!ready || code.length < 3} onClick={join}>
            Unirse
          </button>
        </div>
      </div>

      <p className="home-hint">
        Crea la sala, comparte el código con tus amigos y que cada uno entre desde su navegador
        (móvil o PC). Hasta {MAX_PLAYERS} jugadores por partida.
      </p>
    </div>
  );
}
