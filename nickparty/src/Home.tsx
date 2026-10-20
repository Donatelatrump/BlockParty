import { useState, type CSSProperties, type KeyboardEvent } from 'react';
import { CHARACTERS, MAX_PLAYERS, sanitizeRoom } from '../shared/game';
import { MINIGAMES } from '../shared/minigames';
import type { GameApi } from './useGame';
import { CharacterSprite } from './CharacterSprite';

const ACCENTS = ['#ffd05a', '#9bdf70', '#91cffa', '#e6a8ef', '#bf9eff', '#8de4df', '#ffb580', '#f69db0', '#91d6b5'];
const SERIES = ['Bob Esponja', 'Tortugas Ninja', 'Sam & Cat', 'Sam & Cat', 'Fanboy y Chum Chum', 'Los pingüinos de Madagascar', 'Planet Sheen', 'Victorious'];

export function Home({ api }: { api: GameApi }) {
  const [code, setCode] = useState('');
  const selected = Math.max(0, CHARACTERS.findIndex(character => character.id === api.avatar));
  const character = CHARACTERS[selected];
  const ready = api.name.trim().length > 0 && api.status === 'online';
  const join = () => { if (ready && code.length >= 3) api.joinRoom(code); };
  const navigate = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 4, ArrowUp: -4 };
    let next = index;
    if (event.key in moves) next = (index + moves[event.key] + CHARACTERS.length) % CHARACTERS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = CHARACTERS.length - 1;
    else return;
    event.preventDefault();
    api.setAvatar(CHARACTERS[next].id);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
  };

  return <div className="home party-home">
    <header className="home-heading">
      <span className="home-eyebrow">REÚNE A TU EQUIPO</span>
      <h1 className="home-title">Nicktoons <span>Block Party</span></h1>
      <p className="home-sub">Tu personaje. Tus amigos. Una fiesta en cada casilla.</p>
      <div className="home-features"><span>1–{MAX_PLAYERS} jugadores</span><span>{MINIGAMES.length} minijuegos</span><span>Celular y PC</span></div>
    </header>
    <div className="home-party-card" style={{ '--character-accent': ACCENTS[selected % ACCENTS.length] } as CSSProperties}>
      <aside className="character-preview" aria-label="Tu personaje elegido">
        <span className="preview-label">TU PERSONAJE</span>
        <div className="character-podium"><span className="podium-orbit" /><CharacterSprite key={character.id} id={character.id} label={character.name} portrait /><span className="podium-base" /></div>
        <div className="selected-character-copy"><span className="selected-character-tag">LISTO PARA LA FIESTA</span><h2 aria-live="polite">{character.name}</h2><p>{SERIES[selected] ?? 'Personaje personalizado'}</p></div>
      </aside>
      <div className="home-setup">
        <label className="field home-name"><span><b>01</b> ¿Cómo te llamas?</span><input value={api.name} maxLength={14} autoComplete="nickname" placeholder="Escribe tu nombre" onChange={event => api.setName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && ready) api.joinRoom(''); }} /></label>
        <div className="character-selection">
          <div className="selection-heading"><span id="character-selection-label"><b>02</b> Elige tu personaje</span><small>{CHARACTERS.length} personajes</small></div>
          <div className="character-choices" role="radiogroup" aria-labelledby="character-selection-label">
            {CHARACTERS.map((item, index) => <button type="button" key={item.id} role="radio" aria-checked={selected === index} aria-label={item.name} tabIndex={selected === index ? 0 : -1} className={`character-choice${selected === index ? ' is-selected' : ''}`} style={{ '--choice-accent': ACCENTS[index % ACCENTS.length] } as CSSProperties} onClick={() => api.setAvatar(item.id)} onKeyDown={event => navigate(event, index)}>
              <span className="character-choice-art"><CharacterSprite id={item.id} label={item.name} portrait /></span><span className="character-choice-name">{item.name}</span><span className="character-check" aria-hidden="true">✓</span>
            </button>)}
          </div>
        </div>
        <button className="btn btn-primary btn-lg home-create" disabled={!ready} onClick={() => api.joinRoom('')}>Crear sala nueva <span aria-hidden="true">→</span></button>
        <p className="create-caption">Juega con amigos o añade un rival CPU en la sala.</p>
        <div className="home-join"><label htmlFor="join-code">¿Ya tienes una invitación?</label><div className="join-row"><input id="join-code" className="code-input" aria-label="Código de sala" value={code} placeholder="CÓDIGO" maxLength={5} autoComplete="off" spellCheck={false} onChange={event => setCode(sanitizeRoom(event.target.value))} onKeyDown={event => { if (event.key === 'Enter') join(); }} /><button className="btn btn-secondary" disabled={!ready || code.length < 3} onClick={join}>Unirse</button></div></div>
      </div>
    </div>
    <p className="home-hint">Crea una sala y comparte su código. Cada jugador entra desde su propio celular o computadora.</p>
  </div>;
}
