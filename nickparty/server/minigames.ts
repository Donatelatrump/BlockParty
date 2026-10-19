import type { MinigameState, PlayerState } from '../shared/game.js';
import { MAZE, bedHeight, simonWindow, type ArenaState, type MiniInput, type OriginalMinigame } from '../shared/minigames.js';

const clamp = (n: number, lo = 4, hi = 96) => Math.min(hi, Math.max(lo, n));
const lane = (x: number) => Math.min(2, Math.floor(x / (100 / 3)));
const jump = (p: ArenaState['players'][string], now: number) => p.jumpUntil > now;
export function createArena(ids: string[], kind: OriginalMinigame, startsAt: number): ArenaState {
  const a: ArenaState = { players: {}, objects: [], cells: {}, sequence: Array.from({ length: 7 }, () => Math.floor(Math.random() * 4)), round: 0, lastTick: startsAt, event: -1, seed: Math.floor(Math.random() * 1000), request: 0, winner: null };
  ids.forEach((id, i) => { a.players[id] = { x: kind === 'apartment_maze' ? 15 : 15 + i * 70 / Math.max(1, ids.length - 1), y: kind === 'apartment_maze' ? 18.75 : kind === 'paint' ? 20 + i * 8 : 82, alive: true, score: 0, progress: 0, lastInput: 0, lastAction: 0, jumpUntil: 0, cursor: 0, lastKey: '', finishedAt: null, lives: kind === 'pizza_pursuit' ? 5 : 3 }; });
  if (kind === 'fleas' || kind === 'dodge') for (let i = 0; i < 32; i++) a.objects.push({ id: i, x: 8 + Math.random() * 84, y: kind === 'fleas' ? 12 + Math.random() * 48 : -i * 18, vx: 0, vy: kind === 'dodge' ? 8 : 0, type: kind === 'fleas' ? i % 4 : i % 4 === 0 ? 1 : 0, owner: kind === 'dodge' ? ids[i % ids.length] : null, active: true });
  if (kind === 'lockers') ids.forEach((id, index) => { for (let i = 0; i < 6; i++) a.objects.push({ id: index * 6 + i, x: 10 + i * 16, y: 14 + index * 72 / ids.length, vx: 0, vy: 0, type: 0, owner: id, active: true }); });
  if (kind === 'airhockey') a.objects.push({ id: 0, x: 50, y: 44, vx: 22, vy: 28, type: 0, owner: null, active: true });
  return a;
}
export function arenaInput(mg: MinigameState, playerId: string, input: MiniInput, now: number): boolean {
  const a = mg.arena, start = mg.startsAt ?? 0;
  const p = a?.players[playerId];
  if (!a || !p || !p.alive || p.finishedAt !== null || now < start || now >= mg.endsAt || mg.resultsUntil || now - p.lastInput < 65) return false;
  p.lastInput = now;
  const elapsed = now - start;
  const kind = mg.kind;
  if (kind === 'simon') {
    const w = simonWindow(elapsed);
    if (w.showing || input.key !== 'select' || input.target === undefined || input.target > 3) return false;
    if (a.round !== w.round) { a.round = w.round; for (const q of Object.values(a.players)) q.cursor = 0; }
    if (p.cursor >= w.length) return false;
    if (input.target !== a.sequence[p.cursor]) p.alive = false;
    else { p.cursor++; p.score++; }
  } else if (kind === 'fleas' && input.key === 'drop') {
    const flea = a.objects.find(o => o.id === input.target && o.active);
    if (!flea || input.value !== flea.type) return false;
    flea.active = false; flea.owner = playerId; p.score++;
  } else if (kind === 'demanding_goat' && input.key === 'drop') {
    if (input.target !== a.request) { p.score = Math.max(0, p.score - 1); }
    else { p.score++; a.request = (a.request + 1 + Math.floor(Math.random() * 3)) % 4; }
  } else if (kind === 'lockers' && input.key === 'select') {
    const door = a.objects.find(o => o.id === input.target);
    if (!door) return false;
    door.type = door.owner === playerId ? 1 : 0;
    for (const [id, q] of Object.entries(a.players)) { q.score = a.objects.filter(o => o.owner === id && o.type === 1).length; if (q.score === 6) { q.finishedAt = now; a.winner = id; } }
  } else if (kind === 'dodge' && input.key === 'select') {
    const o = a.objects.find(o => o.id === input.target && o.active && o.owner === playerId && o.y >= 0 && o.y < 88);
    if (!o) return false;
    if (o.type === 0) { o.active = false; p.score++; } else p.lives--;
  } else if (kind === 'lolly' && input.key === 'action') {
    p.progress = Math.min(100, p.progress + 2.5); p.score = Math.floor(p.progress);
    if (p.progress >= 100) { p.finishedAt = now; a.winner = playerId; }
  } else if (kind === 'bouncybed' && input.key === 'action') {
    if (now - p.lastAction < 450) return false;
    const phase = elapsed % 1000;
    if (phase < 160 || phase > 840) p.progress = Math.min(100, p.progress + 12);
    else p.progress = Math.max(0, p.progress - 8);
    p.lastAction = now; p.score = p.progress;
    if (p.progress >= 100) { p.finishedAt = now; a.winner = playerId; }
  } else if (kind === 'apartment_maze') {
    if (Math.floor(p.x / 10) === 8 && Math.floor(p.y / 12.5) === 5 && input.key === 'up' && !a.cells[`${playerId}:8,6`]) {
      a.cells[`${playerId}:8,6`] = playerId; return true;
    }
    const dx = input.key === 'left' ? -1 : input.key === 'right' ? 1 : 0;
    const dy = input.key === 'up' ? -1 : input.key === 'down' ? 1 : 0;
    const x = Math.floor(p.x / 10) + dx, y = Math.floor(p.y / 12.5) + dy;
    if ((!dx && !dy) || MAZE[y]?.[x] !== '.') return false;
    // Doors require an explicit Up input before entering their room.
    if ((x === 5 && y === 3 || x === 8 && y === 6) && !a.cells[`${playerId}:${x},${y}`]) {
      if (input.key !== 'up') return false;
      a.cells[`${playerId}:${x},${y}`] = playerId;
    }
    p.x = x * 10 + 5; p.y = y * 12.5 + 6.25;
    a.cells[`${playerId}:visited:${x},${y}`] = playerId;
    p.score = Object.keys(a.cells).filter(k => k.startsWith(`${playerId}:visited:`)).length;
    if (x === 8 && y === 6) { p.finishedAt = now; p.score += 50; a.winner = playerId; }
  } else {
    if (input.key === 'action' && now - p.lastAction >= 650) { p.jumpUntil = now + 650; p.lastAction = now; }
    if (kind === 'escapeyo' && (input.key === 'left' || input.key === 'right')) {
      if (p.lastKey !== input.key) { p.progress = Math.min(100, p.progress + 1.2); p.score = Math.floor(p.progress); }
      p.lastKey = input.key;
      if (p.progress >= 100) { p.finishedAt = now; a.winner = playerId; }
    } else {
      if (input.key === 'left') p.x = clamp(p.x - 4);
      if (input.key === 'right') p.x = clamp(p.x + 4);
      if (kind === 'paint') { if (input.key === 'up') p.y = clamp(p.y - 6, 8, 92); if (input.key === 'down') p.y = clamp(p.y + 6, 8, 92); }
      if (kind === 'airhockey' && input.key === 'aim' && input.value !== undefined) p.x = clamp(input.value, 12, 88);
    }
  }
  for (const [id, q] of Object.entries(a.players)) mg.collected[id] = q.score;
  return true;
}
export function tickArena(mg: MinigameState, players: PlayerState[], now: number): void {
  const a = mg.arena;
  if (!a || now < (mg.startsAt ?? 0) || mg.resultsUntil) return;
  const dt = Math.min(.25, Math.max(0, (now - a.lastTick) / 1000)); a.lastTick = now;
  const elapsed = now - (mg.startsAt ?? 0), time = elapsed / 1000;
  const event = Math.floor(elapsed / 2600), newEvent = a.event !== event;
  const kind = mg.kind;
  const ids = Object.keys(a.players);
  if (newEvent) a.event = event;
  if (kind === 'simon') {
    const w = simonWindow(elapsed);
    if (w.round !== a.round) {
      for (const p of Object.values(a.players)) { if (p.alive && p.cursor < Math.min(7, 3 + a.round)) p.alive = false; p.cursor = 0; }
      a.round = w.round;
    }
  }
  if ((kind === 'catcher' || kind === 'king_of_the_heap') && Math.floor(time * 3) > a.objects.length) {
    a.objects.push({ id: a.objects.length, x: 6 + Math.random() * 88, y: -4, vx: 0, vy: kind === 'catcher' ? 25 : 35, type: 0, owner: null, active: true });
  }
  for (const o of a.objects) {
    if (!o.active) continue;
    if (kind === 'dodge') { o.y += dt * o.vy; if (o.y > 90) { o.active = false; if (o.type === 0 && o.owner) a.players[o.owner].lives--; } }
    if (kind === 'catcher' || kind === 'king_of_the_heap') {
      o.y += o.vy * dt;
      if (o.y >= 77 && o.y <= 90) for (const [id, p] of Object.entries(a.players)) {
        if (!p.alive || Math.abs(p.x - o.x) > 7) continue;
        if (kind === 'catcher') { p.score++; o.active = false; o.owner = id; break; }
        else { p.lives--; o.active = false; break; }
      }
      if (o.y > 100) o.active = false;
    }
  }
  if (kind === 'airhockey') {
    const o = a.objects[0]; o.x += o.vx * dt; o.y += o.vy * dt;
    // Three goals: bottom, left and right. More players share one of the three sides.
    const goal = o.y >= 91 ? 0 : o.x <= 4 ? 1 : o.x >= 96 ? 2 : -1;
    if (goal >= 0) {
      const defenders = ids.filter((_, i) => i % 3 === goal);
      const coordinate = goal === 0 ? o.x : o.y;
      const defender = defenders.find(id => Math.abs(a.players[id].x - coordinate) < 15);
      if (defender) { o.owner = defender; if (goal === 0) o.vy = -Math.abs(o.vy); else o.vx = goal === 1 ? Math.abs(o.vx) : -Math.abs(o.vx); o.x = clamp(o.x, 5, 95); o.y = clamp(o.y, 5, 90); }
      else { if (o.owner) a.players[o.owner].score++; o.x = 50; o.y = 35; o.vx = Math.random() > .5 ? 24 : -24; o.vy = 28; }
    }
    if (o.y < 5) { o.y = 5; o.vy = Math.abs(o.vy); }
  }
  for (const [id, p] of Object.entries(a.players)) {
    if (!p.alive || p.finishedAt !== null) continue;
    if (!players.find(q => q.id === id)?.connected) continue;
    if (kind === 'paint') a.cells[`${Math.floor(p.x / 10)},${Math.floor(p.y / 10)}`] = id;
    if (kind === 'jumper') {
      const fraction = ((ids.indexOf(id) / ids.length + .25) % 1);
      const passes = Math.floor(elapsed / 2600 - fraction) + 1;
      if (passes > p.cursor) { if (elapsed > 2600 && !jump(p, now)) p.alive = false; p.cursor = passes; }
    }
    if (kind === 'escape' && newEvent && event > 0 && lane(p.x) === (event - 1 + a.seed) % 3) p.alive = false;
    if (kind === 'falling' && newEvent && event > 0 && Math.abs(p.x - (25 + 20 * Math.sin(time * .8))) > 17 && Math.abs(p.x - (75 + 15 * Math.cos(time))) > 17) p.alive = false;
    if (kind === 'teetering') {
      p.x += Math.sin(time * 1.2) * dt * 11;
      if (p.x < 7 || p.x > 93 || newEvent && event > 0 && lane(p.x) === (event + a.seed) % 3) p.alive = false;
    }
    if ((kind === 'escapeyo' || kind === 'pizza_pursuit') && newEvent && event > 0 && !jump(p, now)) { if (kind === 'pizza_pursuit') p.lives--; else p.progress = Math.max(0, p.progress - 12); }
    if (kind === 'escapeyo' && time > 6 && p.progress < (time - 6) * 1.8) p.alive = false;
    if (kind === 'pizza_pursuit') { p.progress = Math.min(100, time * 4); p.score = Math.max(0, p.lives * 10 + Math.floor(time)); }
    if (kind === 'bouncybed') p.y = 82 - bedHeight(elapsed, p.progress);
    if (kind === 'king_of_the_heap') { p.progress = Math.min(100, time * 4); p.score = Math.floor(p.progress); }
    if (['jumper', 'escape', 'falling', 'teetering'].includes(kind)) p.score = Math.floor(time);
    if (p.lives <= 0) p.alive = false;
    mg.collected[id] = p.score;
  }
  if (kind === 'paint') for (const [id, p] of Object.entries(a.players)) { p.score = Object.values(a.cells).filter(owner => owner === id).length; mg.collected[id] = p.score; }
}
export function cpuInput(mg: MinigameState, id: string, now: number): MiniInput | null {
  const a = mg.arena, p = a?.players[id]; if (!a || !p || !p.alive) return null;
  const elapsed = now - (mg.startsAt ?? 0), kind = mg.kind;
  if (kind === 'simon') { const w = simonWindow(elapsed); return w.showing || p.cursor >= w.length ? null : { key: 'select', target: Math.random() < .96 ? a.sequence[p.cursor] : (a.sequence[p.cursor] + 1) % 4 }; }
  if (kind === 'fleas') { const flea = a.objects.find(o => o.active); return flea ? { key: 'drop', target: flea.id, value: flea.type } : null; }
  if (kind === 'demanding_goat') return { key: 'drop', target: a.request };
  if (kind === 'lockers') { const door = a.objects.find(o => o.owner === id && o.type === 0); return door ? { key: 'select', target: door.id } : null; }
  if (kind === 'dodge') { const o = a.objects.find(o => o.owner === id && o.type === 0 && o.active && o.y > 0); return o ? { key: 'select', target: o.id } : null; }
  if (['lolly', 'bouncybed', 'jumper', 'pizza_pursuit'].includes(kind)) return { key: 'action' };
  if (kind === 'escapeyo') return elapsed % 2600 > 2100 ? { key: 'action' } : { key: p.lastKey === 'left' ? 'right' : 'left' };
  if (kind === 'apartment_maze') {
    const x = Math.floor(p.x / 10), y = Math.floor(p.y / 12.5);
    if (x === 8 && y === 5 && !a.cells[`${id}:8,6`]) return { key: 'up' };
    const queue: Array<[number, number, MiniInput['key'] | null]> = [[x, y, null]]; const seen = new Set([`${x},${y}`]);
    for (let i = 0; i < queue.length; i++) {
      const [cx, cy, first] = queue[i]; if (cx === 8 && cy === 6) return first ? { key: first } : null;
      for (const [dx, dy, key] of [[-1, 0, 'left'], [1, 0, 'right'], [0, -1, 'up'], [0, 1, 'down']] as const) {
        const nx = cx + dx, ny = cy + dy, mark = `${nx},${ny}`;
        if (MAZE[ny]?.[nx] !== '.' || seen.has(mark)) continue;
        if (nx === 5 && ny === 3 && key !== 'up' && !a.cells[`${id}:${mark}`]) continue;
        seen.add(mark); queue.push([nx, ny, first ?? key]);
      }
    }
    return null;
  }
  if (kind === 'airhockey') { const o = a.objects[0]; const side = Object.keys(a.players).indexOf(id) % 3; return { key: 'aim', value: side === 0 ? o.x : o.y }; }
  if (kind === 'catcher') { const o = a.objects.filter(o => o.active && o.y > 20).sort((x, y) => y.y - x.y)[0]; return { key: o && o.x < p.x ? 'left' : 'right' }; }
  if (kind === 'falling') return { key: p.x > 25 + 20 * Math.sin(elapsed / 1000 * .8) ? 'left' : 'right' };
  if (kind === 'escape' || kind === 'teetering') { const bad = ((kind === 'escape' ? a.event : a.event + 1) + a.seed) % 3; const target = bad === 1 ? 15 : 50; return { key: p.x > target ? 'left' : 'right' }; }
  return { key: (['left', 'right', 'up', 'down'] as const)[Math.floor(Math.random() * 4)] };
}
