import { useEffect, useRef, useState } from 'react';
import type { RoomState } from '../shared/game';

const TRACKS: Record<string, string> = { spongeBob: 'bob', iCarly: 'icarly' };
export function GameAudio({ state }: { state: RoomState }) {
  const [enabled, setEnabled] = useState(false);
  const [volume, setVolume] = useState(.25);
  const [blocked, setBlocked] = useState(false);
  const track = useRef<HTMLAudioElement | null>(null);
  const context = useRef<AudioContext | null>(null);
  const previous = useRef({ dice: state.dice, phase: state.phase });
  useEffect(() => {
    const audio = new Audio(`/assets/audio/${TRACKS[state.boardTheme] ?? state.boardTheme}.mp3`);
    audio.loop = true; audio.volume = volume; track.current = audio;
    return () => { audio.pause(); audio.removeAttribute('src'); audio.load(); };
  }, [state.boardTheme]);
  useEffect(() => {
    const audio = track.current;
    if (!audio) return;
    audio.volume = volume * (state.phase === 'minigame' ? .45 : 1);
    if (enabled) void audio.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
    else audio.pause();
  }, [enabled, volume, state.boardTheme, state.phase]);
  useEffect(() => {
    const old = previous.current; previous.current = { dice: state.dice, phase: state.phase };
    if (!enabled || !context.current || context.current.state !== 'running') return;
    if (old.dice === state.dice && old.phase === state.phase) return;
    const ctx = context.current;
    const oscillator = ctx.createOscillator(); const gain = ctx.createGain();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(state.phase === 'ended' ? 880 : state.dice !== null && state.dice !== old.dice ? 440 : 660, ctx.currentTime);
    gain.gain.setValueAtTime(volume * .2, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .18);
    oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(); oscillator.stop(ctx.currentTime + .2);
  }, [state.dice, state.phase, enabled, volume]);
  useEffect(() => () => { void context.current?.close(); }, []);
  return <div className="card panel audio-panel"><button className="btn btn-secondary" aria-pressed={enabled} onClick={() => {
    if (!enabled) {
      context.current ??= new AudioContext(); void context.current.resume().catch(() => setBlocked(true));
      void track.current?.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
    }
    setEnabled(!enabled);
  }}>{enabled ? 'Silenciar sonido' : 'Activar sonido'}</button><label>Volumen <input aria-label="Volumen del juego" type="range" min="0" max="1" step=".05" value={volume} onChange={e => setVolume(Number(e.target.value))} /></label>{blocked && enabled && <small>El navegador bloqueó el audio. Desactiva y activa el sonido para reintentarlo.</small>}</div>;
}
