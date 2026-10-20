/** Simulation and rendering share the same trajectory and obstacle clock. */
export const JUMP_MS = 650;
export function oomAttack(elapsed: number, seed: number) {
  let start = 0, round = 0;
  const duration = (i: number) => Math.max(1500, 3200 - i * 200);
  while (elapsed >= start + duration(round)) { start += duration(round); round++; }
  const span = duration(round), phase = Math.max(0, elapsed - start) / span;
  let lane = seed % 3;
  for (let i = 1; i <= round; i++) lane = (lane + 1 + ((seed * 17 + i * 13 + Math.floor(i / 3)) % 2)) % 3;
  const extension = phase < .54 ? 0 : phase < .8 ? Math.pow((phase - .54) / .26, 2) : phase < .86 ? 1 : Math.max(0, 1 - Math.pow((phase - .86) / .14, 2));
  return { start, round, span, phase, lane, extension, strikeAt: start + span * .8 };
}
export function jumpProgress(player: { jumpUntil: number }, now: number) {
  return Math.max(0, Math.min(1, 1 - (player.jumpUntil - now) / JUMP_MS));
}
export function spatulaTurn(elapsed: number) {
  let start = 0, round = 0;
  const duration = (i: number) => Math.max(1000, 3000 - i * 220);
  while (elapsed >= start + duration(round)) { start += duration(round); round++; }
  const span = duration(round);
  return { start, round, span, phase: Math.max(0, elapsed - start) / span };
}
export function nextSpatulaPass(elapsed: number, fraction: number) {
  const turn = spatulaTurn(elapsed);
  const pass = turn.start + turn.span * fraction;
  if (pass > elapsed) return pass;
  return turn.start + turn.span + Math.max(1000, 3000 - (turn.round + 1) * 220) * fraction;
}
export function jellyWave(index: number) {
  let spawnsAt = 0;
  for (let i = 0; i < index; i++) spawnsAt += Math.max(550, 1550 - i * 65);
  return { spawnsAt, speed: Math.min(30, 12 + index * 1.05) };
}
export function jumpHeight(player: { jumpUntil: number }, now: number) {
  const t = 1 - (player.jumpUntil - now) / JUMP_MS;
  return t > 0 && t < 1 ? 18 * 4 * t * (1 - t) : 0;
}
export function runnerObstacle(elapsed: number, seed: number) {
  let start = 0, index = 0;
  const duration = (i: number) => Math.max(1650, 3000 - i * 95) + ((seed + i * 73) % 3 - 1) * 140;
  while (elapsed >= start + duration(index)) { start += duration(index); index++; }
  const span = duration(index);
  return { index, phase: Math.max(0, (elapsed - start) / span), hitAt: start + span * .82, height: 6 + (seed + index) % 3, span };
}
export function signalPhase(elapsed: number, seed: number) {
  const duration = 3600 + seed % 5 * 170;
  const time = Math.max(0, elapsed) % duration;
  return time < duration * .52 ? 'go' : time < duration * .67 ? 'warning' : 'stop';
}
export const TILE_COLORS = ['#f49a3d', '#40bce8', '#b5da53', '#bd8be2'];
export function tileRound(elapsed: number, seed: number) {
  let start = 0, round = 0;
  const duration = (i: number) => Math.max(2300, 4400 - i * 220);
  while (elapsed >= start + duration(round)) { start += duration(round); round++; }
  const span = duration(round), time = Math.max(0, elapsed - start);
  let rng = (seed + round * 104729 + 1) >>> 0;
  const palette = Array.from({ length: 20 }, (_, i) => i % 4);
  for (let i = palette.length - 1; i > 0; i--) {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    const j = Math.floor(rng / 4294967296 * (i + 1));
    [palette[i], palette[j]] = [palette[j], palette[i]];
  }
  const color = (cell: number) => palette[cell];
  return { round, target: (seed + round * 7) % 4, color, dropping: time >= span - 750, remaining: Math.max(0, span - 750 - time), dropAt: start + span - 750 };
}

export interface MazeLayout { rows: string[]; keys: Array<[number, number]>; goal: [number, number] }
export function generateMaze(seed: number): MazeLayout {
  let rng = seed + 1;
  const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
  const width = 13, height = 11;
  const grid = Array.from({ length: height }, () => Array<string>(width).fill('#'));
  const stack: Array<[number, number]> = [[1, 1]]; grid[1][1] = '.';
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const options = [[2, 0], [-2, 0], [0, 2], [0, -2]].filter(([dx, dy]) => grid[y + dy]?.[x + dx] === '#' && x + dx > 0 && x + dx < width - 1 && y + dy > 0 && y + dy < height - 1);
    if (!options.length) { stack.pop(); continue; }
    const [dx, dy] = options[Math.floor(random() * options.length)];
    grid[y + dy / 2][x + dx / 2] = '.'; grid[y + dy][x + dx] = '.'; stack.push([x + dx, y + dy]);
  }
  const farthest = (from: [number, number], excluded: string[]) => {
    const queue: Array<[number, number]> = [from], seen = new Set([from.join(',')]); let best = from;
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i]; if (!excluded.includes(`${x},${y}`)) best = [x, y];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const mark = `${x + dx},${y + dy}`;
        if (grid[y + dy]?.[x + dx] === '.' && !seen.has(mark)) { seen.add(mark); queue.push([x + dx, y + dy]); }
      }
    }
    return best;
  };
  const key1 = farthest([1, 1], ['1,1']);
  const key2 = farthest(key1, ['1,1', key1.join(',')]);
  const goal = farthest(key2, ['1,1', key1.join(','), key2.join(',')]);
  return { rows: grid.map(row => row.join('')), keys: [key1, key2], goal };
}
