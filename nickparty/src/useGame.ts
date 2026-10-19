import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoardThemeId, RoomState, StoreItemId } from '../shared/game';
import { AVATARS } from '../shared/game';
import type { ServerMsg } from '../shared/protocol';
import { NetClient, type NetStatus } from './net';

const ID_KEY = 'nickparty.sessionToken.v2';
const NAME_KEY = 'nickparty.name';
const AVA_KEY = 'nickparty.avatar';

/**
 * Identidad del jugador ligada a la pestaña (sessionStorage), no al navegador.
 * Así dos pestañas/ventanas del mismo equipo son DOS jugadores distintos, que es
 * lo esperable en un juego de fiesta; y recargar la página mantiene tu asiento.
 */
export function loadPlayerId(): string {
  let id = '';
  try {
    id = sessionStorage.getItem(ID_KEY) ?? '';
  } catch {
    /* almacenamiento no disponible */
  }
  if (!id) {
    id = crypto.randomUUID();
    try {
      sessionStorage.setItem(ID_KEY, id);
    } catch {
      /* ignora */
    }
  }
  return id;
}

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function loadAvatar(): string {
  try {
    const a = localStorage.getItem(AVA_KEY);
    if (a && AVATARS.includes(a)) return a;
  } catch {
    /* ignora */
  }
  return AVATARS[Math.floor(Math.random() * AVATARS.length)];
}

export interface GameApi {
  status: NetStatus;
  state: RoomState | null;
  me: string | null;
  room: string | null;
  error: string | null;
  clearError: () => void;
  name: string;
  setName: (v: string) => void;
  avatar: string;
  setAvatar: (v: string) => void;
  joinRoom: (room: string) => void;
  start: (rounds: number, boardTheme?: BoardThemeId, withCpu?: boolean) => void;
  roll: () => void;
  choosePath: (target: number) => void;
  claim: (coinId: number) => void;
  flipCard: (cardId: number) => void;
  miniInput: (input: import('../shared/minigames').MiniInput) => void;
  buyItem: (item: StoreItemId) => void;
  closeStore: () => void;
  goldCoin: (buy: boolean) => void;
  useItem: (item: StoreItemId, targetId?: string) => void;
  answerTrivia: (answer: number) => void;
  chat: (text: string) => void;
  leave: () => void;
}

export function useGame(): GameApi {
  const [status, setStatus] = useState<NetStatus>('connecting');
  const [state, setState] = useState<RoomState | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [room, setRoom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setNameState] = useState(loadName);
  const [avatar, setAvatarState] = useState(loadAvatar);

  const netRef = useRef<NetClient | null>(null);
  const playerIdRef = useRef<string>(loadPlayerId());
  const nameRef = useRef(name);
  const avatarRef = useRef(avatar);
  nameRef.current = name;
  avatarRef.current = avatar;

  const handleMsg = useCallback((msg: ServerMsg) => {
    switch (msg.t) {
      case 'welcome':
        setMe(msg.playerId);
        setRoom(msg.room);
        {
          const url = new URL(location.href);
          url.searchParams.set('sala', msg.room);
          history.replaceState(null, '', url);
        }
        break;
      case 'state':
        setState(msg.state);
        break;
      case 'error':
        setError(msg.message);
        break;
      case 'pong':
        break;
    }
  }, []);

  useEffect(() => {
    const net = new NetClient(handleMsg, setStatus);
    netRef.current = net;
    net.connect();
    const onVisible = () => {
      if (document.visibilityState === 'visible') netRef.current?.connect();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      netRef.current?.stop();
      netRef.current = null;
    };
  }, [handleMsg]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 3500);
    return () => clearTimeout(t);
  }, [error]);

  const setName = useCallback((v: string) => {
    setNameState(v);
    try {
      localStorage.setItem(NAME_KEY, v);
    } catch {
      /* ignora */
    }
  }, []);

  const setAvatar = useCallback((v: string) => {
    setAvatarState(v);
    try {
      localStorage.setItem(AVA_KEY, v);
    } catch {
      /* ignora */
    }
  }, []);

  const joinRoom = useCallback((rawRoom: string) => {
    const net = netRef.current;
    if (!net) return;
    net.setJoin({
      room: rawRoom,
      playerId: '',
      sessionToken: playerIdRef.current,
      name: nameRef.current,
      avatar: avatarRef.current,
    });
    net.connect();
  }, []);

  const start = useCallback((rounds: number, boardTheme?: BoardThemeId, withCpu?: boolean) => {
    netRef.current?.send({ t: 'start', rounds, boardTheme, withCpu });
  }, []);

  const roll = useCallback(() => {
    netRef.current?.send({ t: 'roll' });
  }, []);

  const claim = useCallback((coinId: number) => {
    netRef.current?.send({ t: 'mg:claim', coinId });
  }, []);

  const flipCard = useCallback((cardId: number) => netRef.current?.send({ t: 'mg:flip', cardId }), []);
  const buyItem = useCallback((item: StoreItemId) => netRef.current?.send({ t: 'store:buy', item }), []);
  const closeStore = useCallback(() => netRef.current?.send({ t: 'store:close' }), []);
  const goldCoin = useCallback((buy: boolean) => netRef.current?.send({ t: buy ? 'gold:buy' : 'gold:pass' }), []);
  const useItem = useCallback((item: StoreItemId, targetId?: string) => netRef.current?.send({ t: 'item:use', item, targetId }), []);
  const answerTrivia = useCallback((answer: number) => netRef.current?.send({ t: 'trivia:answer', answer }), []);

  const chat = useCallback((text: string) => {
    netRef.current?.send({ t: 'chat', text });
  }, []);

  const leave = useCallback(() => {
    const net = netRef.current;
    if (net) net.setJoin(null);
    setState(null);
    setMe(null);
    setRoom(null);
    const url = new URL(location.href);
    url.searchParams.delete('sala');
    history.replaceState(null, '', url);
    // Reconecta sin join para desengancharse de la sala actual.
    net?.stop();
    const fresh = new NetClient(handleMsg, setStatus);
    netRef.current = fresh;
    fresh.connect();
  }, [handleMsg]);

  return {
    status,
    state,
    me,
    room,
    error,
    clearError: () => setError(null),
    name,
    setName,
    avatar,
    setAvatar,
    joinRoom,
    start,
    roll,
    choosePath: (target: number) => netRef.current?.send({ t: 'path:choose', target }),
    claim,
    flipCard,
    miniInput: (input: import('../shared/minigames').MiniInput) => netRef.current?.send({ t: 'mg:input', gameId: state?.minigame?.id ?? -1, input }),
    buyItem,
    closeStore,
    goldCoin,
    useItem,
    answerTrivia,
    chat,
    leave,
  };
}
