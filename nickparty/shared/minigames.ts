/** HTML5 rules based on the instructions in the local original translation XML.
 * Physics and durations are adaptations, not extracted ActionScript. */
export const MINIGAMES = [
  { id: 'simon', name: 'Secret Sequence', seconds: 30, controls: 'Pulsa los colores en orden.', desc: 'Observa la secuencia y repítela. Un error te elimina.' },
  { id: 'jumper', name: "Spinnin' Spatula", seconds: 24, controls: 'Espacio o Saltar.', desc: 'Salta cuando la espátula se acerque a tu posición. Sobrevive hasta el final.' },
  { id: 'paint', name: 'Frosty Floor Fill-In', seconds: 25, controls: 'Flechas o controles de movimiento.', desc: 'Recorre la cuadrícula para pintar el suelo de tu color. Gana quien cubra más casillas.' },
  { id: 'fleas', name: 'Puppy Pincher', seconds: 25, controls: 'Arrastra cada pulga al cubo de su color. También puedes seleccionarla y pulsar el cubo.', desc: 'Clasifica las pulgas en los cubos correctos. Gana quien capture más.' },
  { id: 'lolly', name: 'Tasty Race', seconds: 20, controls: 'Pulsa y suelta Espacio o Lamer repetidamente.', desc: 'Termina tu paleta antes que los demás.' },
  { id: 'catcher', name: 'Music Drop', seconds: 25, controls: 'Izquierda y derecha.', desc: 'Muévete bajo las notas que caen y recoge tantas como puedas.' },
  { id: 'escape', name: 'Escape Oom', seconds: 24, controls: 'Izquierda y derecha.', desc: 'Los ojos anuncian el carril del próximo lengüetazo. Evítalo para sobrevivir.' },
  { id: 'falling', name: 'Platform Plunge', seconds: 24, controls: 'Izquierda y derecha.', desc: 'Mantente sobre las plataformas móviles cuando caigan los explosivos.' },
  { id: 'teetering', name: 'Balancing Bonanza', seconds: 24, controls: 'Izquierda y derecha para equilibrarte.', desc: 'Conserva el equilibrio sobre el tronco inclinado y evita los plátanos.' },
  { id: 'lockers', name: 'Locker Lock', seconds: 25, controls: 'Pulsa tus casilleros para cerrarlos; pulsa los ajenos para abrirlos.', desc: 'Cierra tus seis casilleros antes que los demás.' },
  { id: 'escapeyo', name: 'Yo Running Race', seconds: 25, controls: 'Alterna izquierda y derecha. Espacio para saltar.', desc: 'Corre sin que Yo te alcance y salta los obstáculos.' },
  { id: 'king_of_the_heap', name: 'King of the Heap', seconds: 25, controls: 'Izquierda y derecha.', desc: 'Esquiva la basura que cae y asciende hasta la cima.' },
  { id: 'pizza_pursuit', name: 'Pizza Pursuit', seconds: 25, controls: 'Espacio o Saltar.', desc: 'Salta los obstáculos de las alcantarillas y conserva tus pizzas.' },
  { id: 'apartment_maze', name: 'Apartment Maze', seconds: 30, controls: 'Flechas. Arriba abre las puertas.', desc: 'Recorre el apartamento y encuentra la habitación 22.' },
  { id: 'demanding_goat', name: 'Demanding Goat', seconds: 25, controls: 'Arrastra la comida a la cabra o selecciónala y pulsa Entregar.', desc: 'Entrega únicamente la comida que pide la cabra.' },
  { id: 'bouncybed', name: 'iBed Bounce', seconds: 24, controls: 'Espacio o Rebotar al tocar la cama.', desc: 'Sincroniza cada salto para ganar altura y alcanzar la campana.' },
  { id: 'airhockey', name: 'iSlap Shot', seconds: 30, controls: 'Mueve el ratón sobre la pista o usa izquierda y derecha.', desc: 'Protege tu portería y devuelve el disco en la pista de tres lados.' },
  { id: 'dodge', name: 'Jelly Bubble', seconds: 25, controls: 'Pulsa las medusas naranjas que se acercan a tu bandera.', desc: 'Encierra las medusas en burbujas para que no roben tu bandera.' },
] as const;
export type OriginalMinigame = typeof MINIGAMES[number]['id'];
export type MiniInput = { key: 'left' | 'right' | 'up' | 'down' | 'action' | 'select' | 'drop' | 'aim'; target?: number; value?: number };
export interface ArenaPlayer { x: number; y: number; alive: boolean; score: number; progress: number; lastInput: number; lastAction: number; jumpUntil: number; cursor: number; lastKey: string; finishedAt: number | null; lives: number }
export interface ArenaObject { id: number; x: number; y: number; vx: number; vy: number; type: number; owner: string | null; active: boolean }
export interface ArenaState { players: Record<string, ArenaPlayer>; objects: ArenaObject[]; cells: Record<string, string>; sequence: number[]; round: number; lastTick: number; event: number; seed: number; request: number; winner: string | null; }
export const PREPARATION_MS = 8000;
export const RESULTS_MS = 5000;
export function definition(id: OriginalMinigame) { return MINIGAMES.find((game) => game.id === id)!; }
export function simonWindow(elapsed: number) {
  const round = Math.floor(elapsed / 6000);
  const length = Math.min(7, 3 + round);
  const time = elapsed % 6000;
  return { round, length, showing: time < length * 500 + 300, index: Math.floor(time / 500), lit: time % 500 < 360 };
}
export function bedHeight(elapsed: number, progress: number) { return Math.abs(Math.sin(elapsed / 1000 * Math.PI)) * (12 + progress * .6); }
// Fixed maze, with doors on the route and a reachable room 22 at (8, 6).
export const MAZE = ['##########', '#........#', '#.###.##.#', '#...#....#', '###.#.##.#', '#........#', '#.#####..#', '##########'];
