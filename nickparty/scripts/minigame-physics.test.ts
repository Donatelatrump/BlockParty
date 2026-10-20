import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateMaze, jumpHeight, runnerObstacle, signalPhase, tileRound, spatulaTurn, nextSpatulaPass, jellyWave, oomAttack } from '../shared/minigame-physics.js';
import { MINIGAMES, type OriginalMinigame } from '../shared/minigames.js';
import { createArena, arenaInput, tickArena, cpuInput } from '../server/minigames.js';
import type { MinigameState, PlayerState } from '../shared/game.js';

const peers = [{ id: 'a', connected: true }, { id: 'b', connected: true }] as PlayerState[];

test('Oom accelerates with a clear warning and changes lanes without repeating', () => {
  assert.equal(oomAttack(0, 3).span, 3200);
  assert.equal(oomAttack(23000, 3).span, 1500);
  let last = oomAttack(0,3);
  for (let elapsed=0;elapsed<24000;elapsed+=20) {
    const attack=oomAttack(elapsed,3);
    assert.ok(attack.extension>=0 && attack.extension<=1);
    assert.ok(attack.strikeAt-attack.start>=1200);
    if(attack.round!==last.round)assert.notEqual(attack.lane,last.lane);
    last=attack;
  }
});

test('Oom tongue extends, strikes and retracts using the collision clock', () => {
  assert.equal(oomAttack(1000,0).extension,0);
  assert.ok(oomAttack(2400,0).extension>0 && oomAttack(2400,0).extension<1);
  assert.equal(oomAttack(2650,0).extension,1);
  assert.ok(oomAttack(3000,0).extension<1);
  const mg=game('escape');mg.arena!.seed=0;
  mg.arena!.players.a.x=16;mg.arena!.players.b.x=50;
  tickArena(mg,peers,12500);
  assert.equal(mg.arena!.players.a.alive,true,'No invisible hit before the tongue reaches the players');
  tickArena(mg,peers,12600);
  assert.equal(mg.arena!.players.a.alive,false);assert.equal(mg.arena!.players.b.alive,true);
});

test('Oom CPU responds to the currently illuminated lane', () => {
  const mg=game('escape');mg.arena!.seed=0;
  const elapsed=22000, bad=oomAttack(elapsed,0).lane;
  mg.arena!.players.a.x=(bad+.5)*100/3;
  const input=cpuInput(mg,'a',10000+elapsed);
  assert.ok(input && ['left','right'].includes(input.key));
  mg.arena!.players.a.x=((bad+1)%3+.5)*100/3;
  assert.equal(cpuInput(mg,'a',10000+elapsed),null);
  assert.equal(arenaInput(mg,'a',{key:'action'},10001),false,'Jumping is not an escape control');
});

test('spatula accelerates continuously up to three times its starting speed', () => {
  assert.equal(spatulaTurn(0).span, 3000);
  assert.equal(spatulaTurn(24000).span, 1000);
  let previousAngle = 0;
  for (let elapsed = 0; elapsed < 24000; elapsed += 10) {
    const turn = spatulaTurn(elapsed), angle = turn.round + turn.phase;
    assert.ok(angle >= previousAngle && angle-previousAngle < .011);
    const next = nextSpatulaPass(elapsed, .25);
    assert.ok(next > elapsed && next-elapsed <= turn.span);
    previousAngle = angle;
  }
});

test('accelerating spatula resolves a delayed tick using height at the actual crossing', () => {
  const mg = game('jumper');
  const pass = 10000 + nextSpatulaPass(3000, .25);
  arenaInput(mg, 'a', { key: 'action' }, pass - 500);
  tickArena(mg, peers, pass + 200);
  assert.equal(jumpHeight(mg.arena!.players.a, pass + 200), 0);
  assert.equal(mg.arena!.players.a.alive, true);
  assert.equal(mg.arena!.players.a.feedback, 'clear');
});

test('jelly waves increase frequency and speed equally for every flag', () => {
  assert.ok(jellyWave(20).speed > jellyWave(0).speed * 2);
  assert.ok(jellyWave(21).spawnsAt-jellyWave(20).spawnsAt < (jellyWave(1).spawnsAt-jellyWave(0).spawnsAt) / 2);
  assert.ok(jellyWave(25).spawnsAt < 25000);
  const mg = game('dodge');
  assert.equal(mg.arena!.objects.filter(o => o.owner === 'a').length, 26);
  const later = mg.arena!.objects.find(o => o.owner === 'a' && o.spawnsAt === jellyWave(20).spawnsAt)!;
  tickArena(mg, peers, 10000 + later.spawnsAt! + 1000);
  assert.equal(later.y, later.vy);
});

test('a distractor cannot cost several lives by tapping the same jelly twice', () => {
  const mg = game('dodge'), a = mg.arena!, decoy = a.objects.find(o => o.owner === 'a' && o.type === 1)!;
  decoy.y = 30;
  assert.equal(arenaInput(mg, 'a', { key: 'select', target: decoy.id }, 10100), true);
  assert.equal(arenaInput(mg, 'a', { key: 'select', target: decoy.id }, 10200), false);
  assert.equal(a.players.a.lives, 2);
});
function game(kind: OriginalMinigame): MinigameState {
  const def = MINIGAMES.find(g => g.id === kind)!;
  return { id: 1, kind, name: def.name, desc: def.desc, startsAt: 10000, endsAt: 10000 + def.seconds * 1000, arena: createArena(['a', 'b'], kind, 10000), coins: [], cards: [], revealed: [], matched: [], collected: {}, endsRound: false };
}

test('sewer jumps visibly leave the ground and only clear obstacles at sufficient height', () => {
  for (const timing of ['correct', 'early', 'late', 'grounded']) {
    const mg = game('pizza_pursuit'); mg.arena!.seed = 0;
    const crossing = 10000 + runnerObstacle(0, 0).hitAt;
    if (timing !== 'grounded') arenaInput(mg, 'a', { key: 'action' }, crossing - (timing === 'correct' ? 300 : timing === 'early' ? 700 : 5));
    const player = mg.arena!.players.a;
    assert.equal(jumpHeight(player, crossing) > 6, timing === 'correct');
    tickArena(mg, peers, crossing + 50);
    assert.equal(player.lives, timing === 'correct' ? 5 : 4, timing);
    assert.equal(player.feedback, timing === 'correct' ? 'clear' : 'hit');
    tickArena(mg, peers, crossing + 100);
    assert.equal(player.lives, timing === 'correct' ? 5 : 4, 'one penalty per obstacle');
    assert.equal(jumpHeight(player, crossing + 1000), 0, 'lands at original height');
  }
});

test('runner obstacle timing varies and accelerates while leaving a reaction window', () => {
  const spans = new Set<number>();
  for (let elapsed = 0; elapsed < 25000; elapsed += 100) {
    const o = runnerObstacle(elapsed, 42); spans.add(o.span);
    assert.ok(o.phase >= 0 && o.phase < 1 && o.span >= 1510);
  }
  assert.ok(spans.size > 3);
});

test('generated mazes have reachable distinct keys and exit across 80 seeds', () => {
  const layouts = new Set<string>();
  for (let seed = 0; seed < 80; seed++) {
    const maze = generateMaze(seed); layouts.add(maze.rows.join(''));
    assert.equal(new Set(['1,1', ...maze.keys.map(k => k.join(',')), maze.goal.join(',')]).size, 4);
    const queue = [[1, 1]], seen = new Set(['1,1']);
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const mark = `${x + dx},${y + dy}`;
        if (maze.rows[y + dy]?.[x + dx] === '.' && !seen.has(mark)) { seen.add(mark); queue.push([x + dx, y + dy]); }
      }
    }
    for (const point of [...maze.keys, maze.goal]) assert.ok(seen.has(point.join(',')));
    const mg = game('apartment_maze'); mg.arena!.maze = maze;
    for (let now = 10000; now < mg.endsAt && !mg.arena!.winner; now += 150) {
      const input = cpuInput(mg, 'a', now); if (input) arenaInput(mg, 'a', input, now);
    }
    assert.equal(mg.arena!.winner, 'a');
    assert.equal(mg.arena!.players.a.progress, 100);
    assert.ok(mg.arena!.cells['a:key:0'] && mg.arena!.cells['a:key:1']);
  }
  assert.ok(layouts.size > 60);
});

test('maze exit stays locked until both keys are collected', () => {
  const mg = game('apartment_maze'), maze = mg.arena!.maze!, p = mg.arena!.players.a;
  const [x, y] = maze.goal;
  const approach = [[-1, 0, 'right'], [1, 0, 'left'], [0, -1, 'down'], [0, 1, 'up']].find(([dx, dy]) => maze.rows[y + Number(dy)]?.[x + Number(dx)] === '.')!;
  p.x = (x + Number(approach[0]) + .5) / 13 * 100; p.y = (y + Number(approach[1]) + .5) / 11 * 100;
  arenaInput(mg, 'a', { key: approach[2] as 'right' }, 10100);
  assert.equal(p.finishedAt, null); assert.equal(mg.arena!.winner, null);
});

test('color islands eliminate wrong tiles and preserve the announced color', () => {
  const mg = game('color_crumble'), a = mg.arena!; a.seed = 0;
  const round = tileRound(0, 0);
  const good = Array.from({ length: 20 }, (_, i) => i).find(i => round.color(i) === round.target)!;
  const bad = Array.from({ length: 20 }, (_, i) => i).find(i => round.color(i) !== round.target)!;
  for (const [id, cell] of [['a', good], ['b', bad]] as const) { a.players[id].x = cell % 5 * 20 + 10; a.players[id].y = Math.floor(cell / 5) * 25 + 12; }
  tickArena(mg, peers, 10000 + round.dropAt + 50);
  assert.equal(a.players.a.alive, true); assert.equal(a.players.b.alive, false); assert.equal(a.players.a.score, 3);
});

test('red light penalizes held movement once and green advances towards the finish', () => {
  const mg = game('signal_sprint'), p = mg.arena!.players.a; mg.arena!.seed = 0;
  arenaInput(mg, 'a', { key: 'right' }, 10100); assert.ok(p.progress > 0);
  p.progress = 40;
  assert.equal(signalPhase(3000, 0), 'stop');
  arenaInput(mg, 'a', { key: 'right' }, 13000); assert.equal(p.progress, 28);
  assert.equal(arenaInput(mg, 'a', { key: 'right' }, 13100), false); assert.equal(p.progress, 28);
});

test('treasure shockwave uses jump height and cannot damage twice in one wave', () => {
  const mg = game('coin_scramble'), a = mg.arena!;
  for (const p of Object.values(a.players)) { p.x = 72.5; p.y = 50; p.score = 10; }
  a.objects = [];
  arenaInput(mg, 'a', { key: 'action' }, 10700);
  tickArena(mg, peers, 11000);
  assert.equal(a.players.a.score, 10); assert.equal(a.players.b.score, 7);
  tickArena(mg, peers, 11100); assert.equal(a.players.b.score, 7);
});


test('safe islands change between rounds and every color remains reachable', () => {
  const patterns = new Set<string>();
  for (let elapsed = 0; elapsed < 32000; elapsed += 100) {
    const round = tileRound(elapsed, 7);
    const colors = Array.from({ length: 20 }, (_, i) => round.color(i));
    for (let color = 0; color < 4; color++) assert.equal(colors.filter(c => c === color).length, 5);
    patterns.add(colors.map((c, i) => c === round.target ? i : '-').join(','));
  }
  assert.ok(patterns.size >= 8);
});
