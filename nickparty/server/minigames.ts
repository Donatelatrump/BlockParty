import { platformCenters, platformSupport } from '../shared/platforms.js';
import { tickHockey, hockeyCpu } from './hockey.js';
﻿import type { MinigameState, PlayerState } from '../shared/game.js';
import { bedHeight, simonWindow, type ArenaState, type MiniInput, type OriginalMinigame } from '../shared/minigames.js';

import { generateMaze, jumpHeight, oomAttack, spatulaTurn, nextSpatulaPass, jellyWave, runnerObstacle, signalPhase, tileRound, JUMP_MS } from '../shared/minigame-physics.js';

const clamp = (n: number, lo = 4, hi = 96) => Math.min(hi, Math.max(lo, n));
const lane = (x: number) => Math.min(2, Math.floor(x / (100 / 3)));
const jump = (p: ArenaState['players'][string], now: number) => jumpHeight(p, now) >= 5;
export function createArena(ids: string[], kind: OriginalMinigame, startsAt: number): ArenaState {
  const a: ArenaState = { players: {}, objects: [], cells: {}, sequence: Array.from({ length: 7 }, () => Math.floor(Math.random() * 4)), round: 0, lastTick: startsAt, event: -1, seed: Math.floor(Math.random() * 1000), request: 0, winner: null };
  ids.forEach((id, i) => { a.players[id] = { x: kind === 'apartment_maze' ? 15 : 15 + i * 70 / Math.max(1, ids.length - 1), y: kind === 'apartment_maze' ? 18.75 : kind === 'paint' ? 20 + i * 8 : 82, alive: true, score: 0, progress: 0, lastInput: 0, lastAction: 0, jumpUntil: 0, cursor: 0, lastKey: '', finishedAt: null, lives: kind === 'pizza_pursuit' ? 5 : 3 }; });
  if (kind === 'apartment_maze') {
    a.maze = generateMaze(a.seed);
    for (const p of Object.values(a.players)) { p.x = 150 / a.maze.rows[0].length; p.y = 150 / a.maze.rows.length; }
  }
  if (kind === 'color_crumble' || kind === 'coin_scramble') ids.forEach((id, i) => { a.players[id].x = 10 + (i % 5) * 20; a.players[id].y = 20 + Math.floor(i / 5) * 35; });
  if (kind === 'coin_scramble') for (let i = 0; i < 12; i++) a.objects.push({ id: i, x: 12 + i % 4 * 25, y: 18 + Math.floor(i / 4) * 30, vx: 0, vy: 0, type: i % 5 === 0 ? 1 : 0, owner: null, active: true });
  if (kind === 'fleas') for (let i = 0; i < 32; i++) a.objects.push({ id: i, x: 8 + Math.random() * 84, y: 12 + Math.random() * 48, vx: 0, vy: 0, type: i % 4, owner: null, active: true });
  // Every flag receives the same sequence, including with four or eight players.
  if (kind === 'dodge') for (let round = 0; round < 26; round++) ids.forEach((id, index) => {
    const wave = jellyWave(round);
    a.objects.push({ id: round * ids.length + index, x: 18 + round % 3 * 32, y: round === 0 ? 0 : -1, vx: 0, vy: wave.speed, spawnsAt: wave.spawnsAt, type: round % 5 === 4 ? 1 : 0, owner: id, active: true });
  });
  if (kind === 'lockers') ids.forEach((id, index) => { for (let i = 0; i < 6; i++) a.objects.push({ id: index * 6 + i, x: 10 + i * 16, y: 14 + index * 72 / ids.length, vx: 0, vy: 0, type: 0, owner: id, active: true }); });
  if (kind === 'falling') ids.forEach((id, i) => { const group = i % 2; const count = ids.filter((_, j) => j % 2 === group).length; a.players[id].x = platformCenters(0)[group] + (count === 1 ? 0 : (group === 0 ? -10 : -12) + Math.floor(i / 2) * (group === 0 ? 20 : 16) / (count - 1)); });
  if (kind === 'airhockey') { for (const p of Object.values(a.players)) p.x=50; a.objects.push({ id: 0, x: 50, y: 50, vx: 0, vy: 0, type: 0, owner: null, active: false, spawnsAt: 1200 }); }
  return a;
}
export function arenaInput(mg: MinigameState, playerId: string, input: MiniInput, now: number): boolean {
  const a = mg.arena, start = mg.startsAt ?? 0;
  const p = a?.players[playerId];
  if (!a || !p || !p.alive || p.finishedAt !== null || now < start || now >= mg.endsAt || mg.resultsUntil) return false;
  if (input.key === 'action' && !['jumper', 'pizza_pursuit', 'escapeyo', 'coin_scramble', 'bouncybed', 'lolly'].includes(mg.kind)) return false;
  if (now < (p.stunUntil ?? 0)) return false;
  const inputInterval = p.lastInput ? Math.min(.24, Math.max(.065, (now - p.lastInput) / 1000)) : .09;
  // Jump and movement may arrive from two fingers in the same frame.
  // They have independent cooldowns so steering never consumes the jump.
  if (input.key === 'action') {
    const cooldown = mg.kind === 'lolly' ? 65 : mg.kind === 'bouncybed' ? 450 : 650;
    if (now - p.lastAction < cooldown) return false;
  } else {
    if (now - p.lastInput < (mg.kind === 'apartment_maze' ? 115 : 65)) return false;
    p.lastInput = now;
  }
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
    o.active = false; o.resolvedAt = elapsed; o.captured = o.type === 0;
    if (o.type === 0) { p.score++; } else { p.lives--; p.feedback = 'hit'; p.feedbackUntil = now + 700; }
  } else if (kind === 'lolly' && input.key === 'action') {
    p.lastAction = now;
    p.progress = Math.min(100, p.progress + 2.5); p.score = Math.floor(p.progress);
    if (p.progress >= 100) { p.finishedAt = now; a.winner = playerId; }
  } else if (kind === 'bouncybed' && input.key === 'action') {
    if (now - p.lastAction < 450) return false;
    const phase = elapsed % 1000;
    if (phase < 160 || phase > 840) p.progress = Math.min(100, p.progress + 12);
    else p.progress = Math.max(0, p.progress - 8);
    p.lastAction = now; p.score = p.progress;
    if (p.progress >= 100) { p.finishedAt = now; a.winner = playerId; }
  } else if (kind === 'airhockey') {
    if (input.key === 'left') p.x=clamp(p.x-4,18,82);
    else if (input.key === 'right') p.x=clamp(p.x+4,18,82);
    else if (input.key === 'aim' && input.value!==undefined) p.x=clamp(input.value,18,82);
    else return false;
  } else if (kind === 'signal_sprint') {
    if (input.key !== 'right' && input.key !== 'up') return false;
    if (signalPhase(elapsed, a.seed) === 'stop') {
      p.progress = Math.max(0, p.progress - 12); p.stunUntil = now + 950; p.feedback = 'hit'; p.feedbackUntil = now + 950;
    } else p.progress = Math.min(100, p.progress + inputInterval * 14);
    p.score = Math.floor(p.progress / 5);
    if (p.progress >= 100) { p.finishedAt = now; a.winner ??= playerId; }
  } else if (kind === 'apartment_maze') {
    const maze = a.maze!; const width = maze.rows[0].length, height = maze.rows.length;
    const dx = input.key === 'left' ? -1 : input.key === 'right' ? 1 : 0;
    const dy = input.key === 'up' ? -1 : input.key === 'down' ? 1 : 0;
    const x = Math.floor(p.x * width / 100) + dx, y = Math.floor(p.y * height / 100) + dy;
    if ((!dx && !dy) || maze.rows[y]?.[x] !== '.') return false;
    p.x = (x + .5) * 100 / width; p.y = (y + .5) * 100 / height;
    a.cells[`${playerId}:visited:${x},${y}`] = playerId;
    maze.keys.forEach(([kx, ky], i) => { if (x === kx && y === ky) a.cells[`${playerId}:key:${i}`] = playerId; });
    const keys = maze.keys.filter((_, i) => a.cells[`${playerId}:key:${i}`]).length;
    p.progress = keys * 40; p.score = keys * 5;
    if (x === maze.goal[0] && y === maze.goal[1] && keys === maze.keys.length) { p.finishedAt = now; p.progress = 100; p.score += 10; a.winner ??= playerId; }

  } else {
    if (input.key === 'action' && now - p.lastAction >= 650) { p.jumpUntil = now + JUMP_MS; p.lastAction = now; }
    if (kind === 'escapeyo' && (input.key === 'left' || input.key === 'right')) {
      if (p.lastKey !== input.key) { p.progress = Math.min(100, p.progress + 1.2); p.score = Math.floor(p.progress); }
      p.lastKey = input.key;
      if (p.progress >= 100) { p.finishedAt = now; a.winner = playerId; }
    } else {
      if (input.key === 'left') p.x = clamp(p.x - 4);
      if (input.key === 'right') p.x = clamp(p.x + 4);
      if (['paint', 'color_crumble', 'coin_scramble'].includes(kind)) { if (input.key === 'up') p.y = clamp(p.y - 6, 8, 92); if (input.key === 'down') p.y = clamp(p.y + 6, 8, 92); }
    }
  }
  for (const [id, q] of Object.entries(a.players)) mg.collected[id] = q.score;
  return true;
}
export function tickArena(mg: MinigameState, players: PlayerState[], now: number): void {
  const a = mg.arena;
  if (!a || now < (mg.startsAt ?? 0) || mg.resultsUntil) return;
  const previousTick = a.lastTick;
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
  if ((kind === 'catcher' || kind === 'king_of_the_heap') && Math.floor(time * 3 + time * time / 45) > a.objects.length) {
    a.objects.push({ id: a.objects.length, x: 6 + Math.random() * 88, y: -4, vx: 0, vy: (kind === 'catcher' ? 25 : 30) + time * .5, type: a.objects.length % 5 === 4 ? 1 : 0, owner: null, active: true });
  }
  for (const o of a.objects) {
    if (!o.active) continue;
    if (kind === 'dodge') {
      o.y = o.spawnsAt === undefined ? o.y + dt * o.vy : (elapsed - o.spawnsAt) / 1000 * o.vy;
      if (o.y > 90) { o.active = false; if (o.type === 0 && o.owner) { const owner = a.players[o.owner]; if (owner.alive) { owner.lives = Math.max(0, owner.lives-1); owner.feedback = 'hit'; owner.feedbackUntil = now + 700; } } }
    }
    if (kind === 'catcher' || kind === 'king_of_the_heap') {
      o.y += o.vy * dt;
      if (o.y >= 77 && o.y <= 90) for (const [id, p] of Object.entries(a.players)) {
        if (!p.alive || Math.abs(p.x - o.x) > 7) continue;
        if (kind === 'catcher') { p.score = Math.max(0, p.score + (o.type ? -2 : 1)); p.feedback = o.type ? 'hit' : 'clear'; p.feedbackUntil = now + 650; o.active = false; o.owner = id; break; }
        else { p.lives--; p.feedback = 'hit'; p.feedbackUntil = now + 700; o.active = false; break; }
      }
      if (o.y > 100) o.active = false;
    }
  }
  if (kind === 'airhockey') tickHockey(a,new Set(players.filter(p=>p.connected).map(p=>p.id)),elapsed,dt,now);
  for (const [id, p] of Object.entries(a.players)) {
    if (!p.alive || p.finishedAt !== null) continue;
    if (!players.find(q => q.id === id)?.connected) continue;
    if (kind === 'paint') a.cells[`${Math.floor(p.x / 10)},${Math.floor(p.y / 10)}`] = id;
    if (kind === 'jumper') {
      const fraction = (ids.indexOf(id) / ids.length + .25) % 1;
      for (const turn of [spatulaTurn(Math.max(0, previousTick - (mg.startsAt ?? 0))), spatulaTurn(elapsed)]) {
        const passAt = (mg.startsAt ?? 0) + turn.start + turn.span * fraction;
        if (turn.round > 0 && now >= passAt && p.cursor < turn.round) {
          p.cursor = turn.round;
          const cleared = jump(p, passAt);
          if (!cleared) p.alive = false;
          p.feedback = cleared ? 'clear' : 'hit'; p.feedbackUntil = now + 700;
        }
      }
    }
    if (kind === 'escape') {
      for (const attack of [oomAttack(Math.max(0, previousTick - (mg.startsAt ?? 0)), a.seed), oomAttack(elapsed, a.seed)]) {
        if (elapsed >= attack.strikeAt && p.cursor <= attack.round) {
          p.cursor = attack.round + 1;
          const hit = lane(p.x) === attack.lane;
          if (hit) p.alive = false;
          p.feedback = hit ? 'hit' : 'clear'; p.feedbackUntil = now + 650;
        }
      }
    }
    if (kind === 'falling' && !platformSupport(p.x, elapsed)) { p.alive = false; p.fallStartedAt = now; p.feedback = 'hit'; p.feedbackUntil = now + 650; }
    if (kind === 'teetering') {
      p.x += Math.sin(time * 1.2) * dt * 11;
      if (p.x < 7 || p.x > 93 || newEvent && event > 0 && lane(p.x) === (event + a.seed) % 3) p.alive = false;
    }
    if (kind === 'escapeyo' || kind === 'pizza_pursuit') {
      // Evaluate the crossing instant, not whichever network tick happens to arrive after it.
      for (const obstacle of [runnerObstacle(Math.max(0, previousTick - (mg.startsAt ?? 0)), a.seed), runnerObstacle(elapsed, a.seed)]) {
        const hitAt = (mg.startsAt ?? 0) + obstacle.hitAt;
        if (now >= hitAt && p.cursor <= obstacle.index) {
          p.cursor = obstacle.index + 1;
          const cleared = jumpHeight(p, hitAt) > obstacle.height;
          p.feedback = cleared ? 'clear' : 'hit'; p.feedbackUntil = now + 850;
          if (!cleared) { if (kind === 'pizza_pursuit') p.lives--; else p.progress = Math.max(0, p.progress - 12); }
        }
      }
    }
    if (kind === 'color_crumble') {
      const round = tileRound(elapsed, a.seed);
      const cell = Math.min(3, Math.floor(p.y / 25)) * 5 + Math.min(4, Math.floor(p.x / 20));
      if (round.dropping) {
        if (round.color(cell) !== round.target) { p.alive = false; p.feedback = 'hit'; p.feedbackUntil = now + 900; }
        else if (p.cursor <= round.round) { p.cursor = round.round + 1; p.score += 3; p.feedback = 'clear'; p.feedbackUntil = now + 700; }
      }
    }
    if (kind === 'coin_scramble') {
      for (const coin of a.objects) {
        if (!coin.active && elapsed >= coin.vy) { coin.active = true; coin.x = 8 + Math.random() * 84; coin.y = 14 + Math.random() * 72; }
        if (coin.active && Math.hypot(p.x - coin.x, p.y - coin.y) < 6) { coin.active = false; coin.vy = elapsed + 1800; p.score += coin.type ? 3 : 1; p.feedback = 'clear'; p.feedbackUntil = now + 500; }
      }
      const wave = Math.floor(elapsed / 4000), radius = elapsed % 4000 / 4000 * 90;
      if (Math.abs(Math.hypot(p.x - 50, p.y - 50) - radius) < 5 && p.cursor <= wave) {
        p.cursor = wave + 1;
        if (!jump(p, now)) { p.score = Math.max(0, p.score - 3); p.feedback = 'hit'; p.feedbackUntil = now + 800; }
        else { p.feedback = 'perfect'; p.feedbackUntil = now + 700; }
      }
    }
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
  if (kind === 'signal_sprint') return signalPhase(elapsed, a.seed) === 'go' ? { key: 'right' } : null;
  if (kind === 'bouncybed') return elapsed % 1000 < 140 || elapsed % 1000 > 860 ? { key: 'action' } : null;
  if (kind === 'lolly') return { key: 'action' };
  if (kind === 'jumper') {
    const fraction = (Object.keys(a.players).indexOf(id) / Object.keys(a.players).length + .25) % 1;
    const until = nextSpatulaPass(elapsed, fraction) - elapsed;
    return until < 400 ? { key: 'action' } : null;
  }
  if (kind === 'pizza_pursuit' || kind === 'escapeyo') {
    const obstacle = runnerObstacle(elapsed, a.seed), until = obstacle.hitAt - elapsed;
    if (until > 70 && until < 430) return { key: 'action' };
    return kind === 'escapeyo' ? { key: p.lastKey === 'left' ? 'right' : 'left' } : null;
  }
  if (kind === 'color_crumble' || kind === 'coin_scramble') {
    let tx = 50, ty = 50;
    if (kind === 'color_crumble') {
      const round = tileRound(elapsed, a.seed);
      const cells = Array.from({ length: 20 }, (_, i) => i).filter(i => round.color(i) === round.target).sort((x,y) => Math.hypot(x%5*20+10-p.x, Math.floor(x/5)*25+12.5-p.y) - Math.hypot(y%5*20+10-p.x, Math.floor(y/5)*25+12.5-p.y));
      tx = cells[0] % 5 * 20 + 10; ty = Math.floor(cells[0] / 5) * 25 + 12.5;
      if (Math.hypot(tx-p.x, ty-p.y) < 5) return null;
    } else {
      const radius = elapsed % 4000 / 4000 * 90;
      if (Math.abs(Math.hypot(p.x-50,p.y-50)-radius) < 10) return { key: 'action' };
      const coin = a.objects.filter(o => o.active).sort((x,y) => Math.hypot(x.x-p.x,x.y-p.y)-Math.hypot(y.x-p.x,y.y-p.y))[0];
      if (!coin) return null; tx = coin.x; ty = coin.y;
    }
    return { key: Math.abs(tx-p.x) > Math.abs(ty-p.y) ? tx < p.x ? 'left' : 'right' : ty < p.y ? 'up' : 'down' };
  }
  if (kind === 'apartment_maze') {
    const maze = a.maze!, width = maze.rows[0].length, height = maze.rows.length;
    const x = Math.floor(p.x * width / 100), y = Math.floor(p.y * height / 100);
    const target = maze.keys.find((_, i) => !a.cells[`${id}:key:${i}`]) ?? maze.goal;
    const queue: Array<[number, number, MiniInput['key'] | null]> = [[x, y, null]]; const seen = new Set([`${x},${y}`]);
    for (let i = 0; i < queue.length; i++) {
      const [cx, cy, first] = queue[i]; if (cx === target[0] && cy === target[1]) return first ? { key: first } : null;
      for (const [dx, dy, key] of [[-1, 0, 'left'], [1, 0, 'right'], [0, -1, 'up'], [0, 1, 'down']] as const) {
        const nx = cx + dx, ny = cy + dy, mark = `${nx},${ny}`;
        if (maze.rows[ny]?.[nx] !== '.' || seen.has(mark)) continue;
        seen.add(mark); queue.push([nx, ny, first ?? key]);
      }
    }
    return null;
  }
  if (kind === 'airhockey') return { key: 'aim', value: hockeyCpu(a,id,elapsed) };
  if (kind === 'catcher') { const o = a.objects.filter(o => o.active && o.y > 20).sort((x, y) => y.y - x.y)[0]; return { key: o && o.x < p.x ? 'left' : 'right' }; }
  if (kind === 'falling') { const target = platformCenters(elapsed).sort((a,b)=>Math.abs(p.x-a)-Math.abs(p.x-b))[0]; return { key: p.x > target ? 'left' : 'right' }; }
  if (kind === 'escape') {
    const bad = oomAttack(elapsed,a.seed).lane;
    if (lane(p.x) !== bad) return null;
    const target = [100/6,50,500/6].filter(x => lane(x)!==bad).sort((x,y)=>Math.abs(x-p.x)-Math.abs(y-p.x))[0];
    return { key: p.x > target ? 'left' : 'right' };
  }
  if (kind === 'teetering') { const bad = (a.event + 1 + a.seed) % 3; const target = bad === 1 ? 15 : 50; return { key: p.x > target ? 'left' : 'right' }; }
  return { key: (['left', 'right', 'up', 'down'] as const)[Math.floor(Math.random() * 4)] };
}
