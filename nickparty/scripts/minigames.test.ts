import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MINIGAMES, PREPARATION_MS, type OriginalMinigame } from '../shared/minigames.js';
import type { MinigameState, PlayerState } from '../shared/game.js';
import { createArena, arenaInput, tickArena, cpuInput } from '../server/minigames.js';
import { publicState } from '../server/public-state.js';
import { Room } from '../server/room.js';
import { parseClientMsg } from '../shared/protocol.js';

function game(kind: OriginalMinigame): MinigameState {
  const def = MINIGAMES.find(g => g.id === kind)!;
  return { id: 1, kind, name: def.name, desc: def.desc, startsAt: 10000, endsAt: 10000 + def.seconds * 1000, arena: createArena(['a', 'b'], kind, 10000), coins: [], cards: [], revealed: [], matched: [], collected: { a: 0, b: 0 }, endsRound: false };
}
const players = [{ id: 'a', connected: true }, { id: 'b', connected: true }] as PlayerState[];

test('new minigame payloads reject malformed controls and nonfinite coordinates', () => {
  for (const input of [null, {}, { key: 'teleport' }, { key: 'aim', value: 101 }, { key: 'drop', target: -1 }, { key: 'aim', value: '50' }]) assert.equal(parseClientMsg(JSON.stringify({ t: 'mg:input', gameId: 1, input })), null);
  assert.ok(parseClientMsg(JSON.stringify({ t: 'mg:input', gameId: 1, input: { key: 'left' } })));
});
test('server rejects preparation, expired, eliminated and rapid inputs', () => {
  const mg = game('lolly');
  assert.equal(arenaInput(mg, 'a', { key: 'action' }, 9999), false);
  assert.ok(arenaInput(mg, 'a', { key: 'action' }, 10000));
  assert.equal(arenaInput(mg, 'a', { key: 'action' }, 10001), false);
  assert.equal(mg.collected.a, 2);
  mg.arena!.players.a.alive = false;
  assert.equal(arenaInput(mg, 'a', { key: 'action' }, 10200), false);
  assert.equal(arenaInput(mg, 'b', { key: 'action' }, mg.endsAt), false);
});
test('Secret Sequence reveals only the currently lit color and validates ordered answers', t => {
  t.mock.timers.enable({ apis: ['Date'], now: 10000 });
  const mg = game('simon'); mg.arena!.sequence = [2, 1, 3, 0, 1, 2, 0];
  const room = new Room('SECRET'); t.after(() => room.close()); room.state.minigame = mg;
  assert.deepEqual(publicState(room.state).minigame!.arena!.sequence, [2, -1, -1, -1, -1, -1, -1]);
  t.mock.timers.tick(2000);
  assert.deepEqual(publicState(room.state).minigame!.arena!.sequence, [-1, -1, -1, -1, -1, -1, -1]);
  assert.ok(arenaInput(mg, 'a', { key: 'select', target: 2 }, 12000));
  arenaInput(mg, 'a', { key: 'select', target: 1 }, 12200);
  arenaInput(mg, 'a', { key: 'select', target: 3 }, 12400);
  assert.equal(mg.collected.a, 3);
  arenaInput(mg, 'b', { key: 'select', target: 0 }, 12000);
  assert.equal(mg.arena!.players.b.alive, false);
  assert.deepEqual(mg.arena!.sequence, [2, 1, 3, 0, 1, 2, 0]);
});
test('Puppy Pincher requires the right bucket and each flea can only be captured once', () => {
  const mg = game('fleas'); const flea = mg.arena!.objects[0];
  assert.equal(arenaInput(mg, 'a', { key: 'drop', target: flea.id, value: 1 }, 10000), false);
  assert.ok(arenaInput(mg, 'a', { key: 'drop', target: flea.id, value: flea.type }, 10100));
  assert.equal(arenaInput(mg, 'b', { key: 'drop', target: flea.id, value: flea.type }, 10200), false);
  assert.equal(mg.collected.a, 1); assert.equal(mg.collected.b, 0);
});
test('painting changes ownership, lockers allow interference, and goat changes its request', () => {
  const paint = game('paint'); paint.arena!.players.b.x = paint.arena!.players.a.x; paint.arena!.players.b.y = paint.arena!.players.a.y;
  tickArena(paint, players, 10100); tickArena(paint, players, 10200);
  assert.equal(paint.collected.a, 0); assert.equal(paint.collected.b, 1);
  const lockers = game('lockers');
  arenaInput(lockers, 'a', { key: 'select', target: 0 }, 10000); assert.equal(lockers.collected.a, 1);
  arenaInput(lockers, 'b', { key: 'select', target: 0 }, 10100); assert.equal(lockers.arena!.players.a.score, 0);
  const goat = game('demanding_goat');
  arenaInput(goat, 'a', { key: 'drop', target: 0 }, 10000); assert.equal(goat.collected.a, 1); assert.notEqual(goat.arena!.request, 0);
});
test('races require alternating input and timed bed bounces reward landing rather than midair', () => {
  const race = game('escapeyo');
  arenaInput(race, 'a', { key: 'left' }, 10000); const progress = race.arena!.players.a.progress;
  arenaInput(race, 'a', { key: 'left' }, 10100); assert.equal(race.arena!.players.a.progress, progress);
  arenaInput(race, 'a', { key: 'right' }, 10200); assert.ok(race.arena!.players.a.progress > progress);
  const bed = game('bouncybed'); arenaInput(bed, 'a', { key: 'action' }, 10000); assert.equal(bed.collected.a, 12);
  arenaInput(bed, 'a', { key: 'action' }, 10500); assert.equal(bed.collected.a, 4);
});

test('simultaneous touch steering and jump use separate cooldowns', () => {
  const mg = game('escapeyo');
  assert.ok(arenaInput(mg, 'a', { key: 'left' }, 10000));
  assert.ok(arenaInput(mg, 'a', { key: 'action' }, 10000));
  assert.equal(mg.arena!.players.a.jumpUntil, 10650);
  assert.equal(arenaInput(mg, 'a', { key: 'action' }, 10050), false);
  assert.ok(arenaInput(mg, 'a', { key: 'right' }, 10100));
  assert.equal(mg.arena!.players.a.progress, 2.4);
});
test('spatula eliminates a grounded player and preserves a correctly timed jump', () => {
  const mg = game('jumper');
  // First revolution is a grace period; the second lasts 2780ms.
  for (let now = 10000; now <= 13300; now += 100) tickArena(mg, players, now);
  arenaInput(mg, 'a', { key: 'action' }, 13400);
  tickArena(mg, players, 13700); assert.equal(mg.arena!.players.a.alive, true);
  tickArena(mg, players, 15100); assert.equal(mg.arena!.players.b.alive, false);
});
test('the maze CPU navigates walls and collects both keys to reach room 22', () => {
  const mg = game('apartment_maze');
  for (let now = 10000; now < mg.endsAt && !mg.arena!.winner; now += 150) {
    const input = cpuInput(mg, 'a', now); if (input) arenaInput(mg, 'a', input, now);
    tickArena(mg, players, now);
  }
  assert.equal(mg.arena!.winner, 'a');
});
for (const def of MINIGAMES) test(`${def.name}: authoritative simulation with eight players stays finite and bounded`, () => {
  const mg = game(def.id); const ids = Array.from({ length: 8 }, (_, i) => String(i));
  mg.arena = createArena(ids, def.id, mg.startsAt!); mg.collected = Object.fromEntries(ids.map(id => [id, 0]));
  const peers = ids.map(id => ({ id, connected: true })) as PlayerState[];
  for (let now = mg.startsAt!; now < mg.endsAt; now += 100) {
    tickArena(mg, peers, now);
    if (now % 400 === 0) for (const id of ids) { const input = cpuInput(mg, id, now); if (input) arenaInput(mg, id, input, now); }
    for (const p of Object.values(mg.arena.players)) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.score) && p.score >= 0);
  }
  assert.equal(Object.keys(mg.arena.players).length, 8);
});
test('minigames prepare, retain results, pause across reconnect and award coins only once', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000000 }); t.mock.method(Math, 'random', () => 0);
  const room = new Room('FLOW'); t.after(() => room.close());
  room.join('a', 'Ana', 'bob'); room.start('a', 4, 'spongeBob', true);
  room.state.board[1].type = 'challenge'; room.state.goldCoinPos = 10;
  room.roll('a'); for (let i = 0; i < 30 && !room.state.minigame; i++) t.mock.timers.tick(100);
  const mg = room.state.minigame!; assert.ok(mg?.arena); assert.equal(mg.startsAt! - Date.now(), PREPARATION_MS);
  const before = mg.startsAt!; room.disconnect('a'); t.mock.timers.tick(5000); room.join('a', 'Ana', 'bob');
  assert.equal(mg.startsAt, before + 5000);
  while (!mg.resultsUntil) t.mock.timers.tick(100);
  const coins = room.state.players[0].coins; assert.equal(room.state.phase, 'minigame');
  room.miniInput('a', { key: 'select', target: 0 }); assert.equal(room.state.players[0].coins, coins);
  room.disconnect('a'); t.mock.timers.tick(2000); room.join('a', 'Ana', 'bob');
  assert.equal(room.state.players[0].coins, coins);
  for (let i = 0; i < 60 && room.state.minigame; i++) t.mock.timers.tick(100);
  assert.equal(room.state.minigame, null); assert.equal(room.state.players[0].coins, coins);
});

test('all catalog minigames are selected once before the catalog repeats', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000000 }); t.mock.method(Math, 'random', () => .1);
  const room = new Room('CATALOG'); t.after(() => room.close());
  room.join('a', 'Ana', 'bob'); room.join('b', 'Beto', 'mikey'); room.start('a', 4);
  room.state.board[1].type = 'challenge'; room.state.goldCoinPos = 10;
  const seen = new Set<string>();
  for (let index = 0; index < MINIGAMES.length; index++) {
    room.state.phase = 'playing'; room.state.turn = 0; room.state.dice = null; room.state.players[0].pos = 0;
    room.roll('a'); for (let i = 0; i < 30 && !room.state.minigame; i++) t.mock.timers.tick(100);
    assert.ok(room.state.minigame); assert.ok(!seen.has(room.state.minigame.kind)); seen.add(room.state.minigame.kind);
    for (let i = 0; i < 650 && room.state.minigame; i++) t.mock.timers.tick(100);
    assert.equal(room.state.minigame, null); t.mock.timers.tick(1000);
  }
  assert.equal(seen.size, MINIGAMES.length);
});
test('final bonuses reward category leaders and ties, without granting gold for each minigame', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000000 }); t.mock.method(Math, 'random', () => 0);
  const room = new Room('BONUS'); t.after(() => room.close());
  room.join('a', 'Ana', 'bob'); room.join('b', 'Beto', 'mikey'); room.start('a', 4);
  room.state.board[1].type = 'challenge'; room.state.goldCoinPos = 10;
  room.roll('a'); for (let i = 0; i < 30 && !room.state.minigame; i++) t.mock.timers.tick(100);
  const mg = room.state.minigame!; mg.kind = 'lolly'; mg.endsRound = false;
  mg.arena = createArena(['a', 'b'], 'lolly', mg.startsAt!); mg.arena.players.a.score = 50; mg.collected.a = 50;
  room.state.maxRounds = 1;
  room.state.players[0].stats = { minigameCoins: 0, blueSpaces: 2, triviaCorrect: 1 };
  room.state.players[1].stats = { minigameCoins: 0, blueSpaces: 2, triviaCorrect: 0 };
  for (let i = 0; i < 500 && !mg.resultsUntil; i++) t.mock.timers.tick(100);
  assert.equal(room.state.players[0].gold, 0); assert.equal(room.state.players[0].coins, 20);
  assert.equal(mg.rewards?.a, 10);
  for (let i = 0; i < 60 && room.state.phase !== 'ended'; i++) t.mock.timers.tick(100);
  assert.equal(room.state.phase, 'ended'); assert.equal(room.state.players[0].gold, 3); assert.equal(room.state.players[1].gold, 1);
  assert.equal(room.state.winnerId, 'a');
});

test('jellyfish targets are fair for every flag with eight players', () => {
  const ids = Array.from({ length: 8 }, (_, i) => `p${i}`);
  const arena = createArena(ids, 'dodge', 10000);
  const expected = arena.objects.filter(o => o.owner === ids[0]).map(o => [o.y, o.type]);
  for (const id of ids) {
    assert.deepEqual(arena.objects.filter(o => o.owner === id).map(o => [o.y, o.type]), expected);
    assert.equal(arena.objects.filter(o => o.owner === id && o.type === 0).length, 21);
  }
});
