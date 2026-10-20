/** HTML5 rules based on the instructions in the local original translation XML.
 * Physics and durations are adaptations, not extracted ActionScript. */
export const MINIGAMES = [
  { id: 'simon', name: 'Secret Sequence', seconds: 30, controls: 'Pulsa los colores en orden.', desc: 'Observa la secuencia y repítela. Un error te elimina.' },
  { id: 'jumper', name: "Spinnin' Spatula", seconds: 24, controls: 'Espacio o Saltar.', desc: 'Salta cuando la espátula se acerque a tu posición. Cada vuelta es más rápida. Sobrevive hasta el final.' },
  { id: 'paint', name: 'Frosty Floor Fill-In', seconds: 25, controls: 'WASD, flechas o controles de movimiento.', desc: 'Recorre la cuadrícula para pintar el suelo de tu color. Gana quien cubra más casillas.' },
  { id: 'fleas', name: 'Puppy Pincher', seconds: 25, controls: 'Arrastra cada pulga al cubo de su color. También puedes seleccionarla y pulsar el cubo.', desc: 'Clasifica las pulgas en los cubos correctos. Gana quien capture más.' },
  { id: 'lolly', name: 'Tasty Race', seconds: 20, controls: 'Pulsa y suelta Espacio o Lamer repetidamente.', desc: 'Termina tu paleta antes que los demás.' },
  { id: 'catcher', name: 'Music Drop', seconds: 25, controls: 'A / D o flechas izquierda y derecha.', desc: 'Muévete bajo las notas que caen y recoge las doradas. Evita las notas rojas: restan dos puntos.' },
  { id: 'escape', name: 'Escape Oom', seconds: 24, controls: 'A / D o flechas izquierda y derecha.', desc: 'El carril iluminado anuncia el lengüetazo. Sal antes del golpe: Oom ataca cada vez más rápido.' },
  { id: 'falling', name: 'Platform Plunge', seconds: 24, controls: 'A / D o flechas izquierda y derecha.', desc: 'Sigue las plataformas móviles. Si tus pies salen del borde, caes y quedas eliminado.' },
  { id: 'teetering', name: 'Balancing Bonanza', seconds: 24, controls: 'Izquierda y derecha para equilibrarte.', desc: 'Conserva el equilibrio sobre el tronco inclinado y evita los plátanos.' },
  { id: 'lockers', name: 'Locker Lock', seconds: 25, controls: 'Pulsa tus casilleros para cerrarlos; pulsa los ajenos para abrirlos.', desc: 'Cierra tus seis casilleros antes que los demás.' },
  { id: 'escapeyo', name: 'Yo Running Race', seconds: 25, controls: 'Alterna izquierda y derecha. Espacio para saltar.', desc: 'Corre sin que Yo te alcance y salta los obstáculos.' },
  { id: 'king_of_the_heap', name: 'King of the Heap', seconds: 25, controls: 'A / D o flechas izquierda y derecha.', desc: 'Esquiva la basura que cae y asciende hasta la cima.' },
  { id: 'pizza_pursuit', name: 'Pizza Pursuit', seconds: 25, controls: 'Espacio o Saltar.', desc: 'Salta los obstáculos de las alcantarillas y conserva tus pizzas.' },
  { id: 'apartment_maze', name: 'Apartment Maze', seconds: 45, controls: 'WASD o flechas. Recoge las dos llaves antes de salir.', desc: 'Un laberinto distinto cada partida. Memoriza el mapa al inicio; después explora con visibilidad limitada. Busca dos llaves y la puerta 22.' },
  { id: 'demanding_goat', name: 'Demanding Goat', seconds: 25, controls: 'Arrastra la comida a la cabra o selecciónala y pulsa Entregar.', desc: 'Entrega únicamente la comida que pide la cabra.' },
  { id: 'bouncybed', name: 'iBed Bounce', seconds: 24, controls: 'Espacio o Rebotar al tocar la cama.', desc: 'Sincroniza cada salto para ganar altura y alcanzar la campana.' },
  { id: 'airhockey', name: 'iSlap Shot', seconds: 40, controls: 'Tu portería está abajo. Usa izquierda/derecha, el ratón o el deslizador.', desc: 'Cada jugador tiene su propia portería. Ataja para sumar 1 punto, marca goles para sumar 3 y evita recibirlos: restan 1.' },
  { id: 'dodge', name: 'Jelly Bubble', seconds: 25, controls: 'Pulsa las medusas naranjas que se acercan a tu bandera.', desc: 'Encierra las medusas naranjas y evita las violetas. Llegan más seguido y caen más rápido.' },
  { id: 'color_crumble', name: 'Islas de color', seconds: 32, controls: 'WASD, flechas o cruceta.', desc: 'Busca el color anunciado antes de que caiga el suelo. Cada ronda te da menos tiempo.' },
  { id: 'signal_sprint', name: 'Semáforo tramposo', seconds: 32, controls: 'Mantén Derecha para correr. Suelta al ver la advertencia.', desc: 'Avanza con luz verde y detente en rojo. Una salida falsa te hace retroceder. Llega primero a la meta.' },
  { id: 'coin_scramble', name: 'Tesoro bajo fuego', seconds: 32, controls: 'WASD o cruceta. Espacio o Saltar para esquivar.', desc: 'Recoge monedas en la arena y salta las ondas de choque. Un golpe te quita monedas.' },
] as const;
export type OriginalMinigame = typeof MINIGAMES[number]['id'];
export type MiniInput = { key: 'left' | 'right' | 'up' | 'down' | 'action' | 'select' | 'drop' | 'aim'; target?: number; value?: number };
export interface ArenaPlayer { x: number; y: number; alive: boolean; score: number; progress: number; lastInput: number; lastAction: number; jumpUntil: number; cursor: number; lastKey: string; finishedAt: number | null; lives: number; feedback?: 'hit' | 'clear' | 'perfect'; feedbackUntil?: number; stunUntil?: number; fallStartedAt?: number }
export interface ArenaObject { id: number; x: number; y: number; vx: number; vy: number; type: number; owner: string | null; active: boolean; spawnsAt?: number; captured?: boolean; resolvedAt?: number }
export interface ArenaState { players: Record<string, ArenaPlayer>; objects: ArenaObject[]; cells: Record<string, string>; sequence: number[]; round: number; lastTick: number; event: number; seed: number; request: number; winner: string | null; maze?: import('./minigame-physics').MazeLayout; }
export const PREPARATION_MS = 8000;
export const RESULTS_MS = 5000;
export function definition(id: OriginalMinigame) { return MINIGAMES.find((game) => game.id === id)!; }
export function simonWindow(elapsed: number) {
  const round = Math.floor(elapsed / 6000);
  const length = Math.min(7, 3 + round);
  const time = elapsed % 6000;
  return { round, length, showing: time < length * 500 + 300, index: Math.floor(time / 500), lit: time % 500 < 360 };
}
export function bedHeight(elapsed: number, progress: number) { return Math.abs(Math.sin(elapsed / 1000 * Math.PI)) * (12 + progress * .5); }
