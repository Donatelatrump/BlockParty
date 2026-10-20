import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/room.js';
import { publicState } from '../server/public-state.js';
import { BOARD_PATHS } from '../shared/board-paths.js';
import { BOARD_THEMES, buildBoard, type MinigameState } from '../shared/game.js';
import { parseClientMsg } from '../shared/protocol.js';

function setup(): Room {
  const room = new Room('TEST');
  room.join('a', 'Ana', 'bob');
  room.join('b', 'Beto', 'mikey');
  assert.ok(room.start('a', 4).ok);
  return room;
}

test('all original maps have valid connected paths, junctions and authored animation curves', () => {
  for (const theme of BOARD_THEMES) {
    const graph = BOARD_PATHS[theme.id];
    assert.equal(graph.nodes.length, buildBoard(theme.id).length);
    const visited = new Set<number>();
    const visit = (i: number) => { if (visited.has(i)) return; visited.add(i); graph.nodes[i].next.forEach(visit); };
    visit(0);
    assert.equal(visited.size, graph.nodes.length, theme.id);
    assert.ok(graph.nodes.some((n) => n.next.length > 1));
    graph.nodes.forEach((n, i) => {
      assert.ok(n.x >= 0 && n.x <= 100 && n.y >= 0 && n.y <= 100);
      for (const next of n.next) assert.ok(graph.edges[`${i}-${next}`].length > 2);
    });
  }
});

test('server pauses at real junctions, rejects illegal paths and preserves remaining steps', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  t.mock.method(Math, 'random', () => 0);
  const room = setup(); t.after(() => room.close());
  room.state.players[0].pos = 12;
  room.state.goldCoinPos = 0;
  assert.ok(room.roll('a').ok);
  assert.equal(room.roll('a').ok, false);
  t.mock.timers.tick(850);
  assert.equal(room.state.phase, 'choosingPath');
  assert.deepEqual(room.state.pathChoice?.options, BOARD_PATHS.spongeBob.nodes[12].next);
  assert.equal(room.choosePath('b', 40).ok, false);
  assert.equal(room.choosePath('a', 0).ok, false);
  assert.ok(room.choosePath('a', 40).ok);
  assert.equal(room.state.movement?.to, 40);
  t.mock.timers.tick(480);
  assert.equal(room.state.players[0].pos, 40);
  assert.equal(room.roll('a').ok, false);
});

test('triple dice expose individual faces and a shared throw window before movement', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  t.mock.method(Math, 'random', () => .4);
  const room = setup(); t.after(() => room.close());
  room.state.players[0].diceCount = 3;
  assert.ok(room.roll('a').ok);
  const roll = publicState(room.state).diceRoll!;
  assert.deepEqual(roll.values, [3, 3, 3]);
  assert.equal(room.state.dice, 9);
  assert.equal(roll.startedAt, Date.now());
  assert.equal(room.state.players[0].diceCount, 1);
  t.mock.timers.tick(roll.duration - 1);
  assert.equal(room.state.movement, null);
  t.mock.timers.tick(1);
  assert.ok(room.state.movement);
});

test('gold coin encountered during movement resumes the remaining steps', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  t.mock.method(Math, 'random', () => 0.2); // two steps
  const room = setup(); t.after(() => room.close());
  room.state.goldCoinPos = 1;
  room.roll('a');
  t.mock.timers.tick(850); t.mock.timers.tick(480);
  assert.equal(room.state.phase, 'goldCoin');
  room.resolveGoldCoin('a', false);
  t.mock.timers.tick(650); t.mock.timers.tick(480);
  assert.equal(room.state.players[0].pos, 2);
});

test('host transfer is unique and disconnects cannot strand modal phases', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  for (const phase of ['store', 'trivia', 'goldCoin', 'choosingPath'] as const) {
    const room = setup();
    room.state.phase = phase;
    room.disconnect('a');
    t.mock.timers.tick(400);
    assert.equal(room.state.turn, 1);
    assert.equal(room.state.phase, 'playing');
    room.join('a', 'Ana', 'bob');
    assert.deepEqual(room.state.players.filter((p) => p.isHost).map((p) => p.id), ['b']);
    room.close();
  }
});

test('private trivia answers and unrevealed memory cards never enter public state', () => {
  const room = setup();
  room.state.trivia = { playerId: 'a', question: { question: 'Q', answers: [{ text: 'A', correct: true }] } };
  room.state.minigame = { id: 1, kind: 'memory', cards: [1, 2, 1, 2], revealed: [0], matched: [], coins: [], collected: {}, endsAt: 100, endsRound: false, name: '', desc: '' };
  const visible = publicState(room.state);
  assert.equal('correct' in visible.trivia!.question.answers[0], false);
  assert.deepEqual(visible.minigame?.cards, [1, -1, -1, -1]);
  assert.equal(room.state.trivia.question.answers[0].correct, true);
  assert.deepEqual(room.state.minigame.cards, [1, 2, 1, 2]);
  room.close();
});

test('reflex targets reject early, duplicate and expired claims', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const room = setup(); t.after(() => room.close());
  const mg: MinigameState = { id: 1, kind: 'whack', cards: [], revealed: [], matched: [], coins: [{ id: 1, x: 50, y: 50, value: 2, by: null, appearsAt: 1100, expiresAt: 1300 }], collected: {}, endsAt: 1400, endsRound: false, name: '', desc: '' };
  room.state.phase = 'minigame'; room.state.minigame = mg;
  room.claim('a', 1); assert.equal(mg.coins[0].by, null);
  t.mock.timers.tick(100); room.claim('a', 1); room.claim('b', 1);
  assert.equal(mg.collected.a, 2); assert.equal(mg.collected.b, undefined);
  mg.coins[0].by = null;
  t.mock.timers.tick(300); room.claim('b', 1);
  assert.equal(mg.coins[0].by, null);
});

test('malformed protocol payloads cannot reach room handlers', () => {
  for (const input of ['null', '{', '{"t":"join","room":3}', '{"t":"mg:flip","cardId":-1}', '{"t":"start","rounds":1.5}', '{"t":"item:use","item":"unknown"}']) assert.equal(parseClientMsg(input), null);
  assert.ok(parseClientMsg('{"t":"path:choose","target":40}'));
});

test('solo match pauses with no human connected and CPU completes its own turns and paths', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000000 });
  let seed = 42;
  t.mock.method(Math, 'random', () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296));
  const room = new Room('SOLO'); t.after(() => room.close());
  room.join('a', 'Ana', 'bob');
  assert.ok(room.start('a', 4, 'madagascar', true).ok);
  const bot = room.state.players.find((p) => p.isBot)!;
  bot.pos = BOARD_PATHS.madagascar.nodes.findIndex((n) => n.next.length > 1);
  room.disconnect('a');
  const version = room.state.version;
  t.mock.timers.tick(10000);
  assert.equal(room.state.version, version);
  room.join('a', 'Ana', 'bob');
  let cpuMoved = false;
  let cpuChose = false;
  for (let i = 0; i < 30000 && room.state.phase !== 'ended'; i++) {
    const st = room.state;
    if (st.movement?.playerId === bot.id) cpuMoved = true;
    if (st.pathChoice?.playerId === bot.id) cpuChose = true;
    if (st.players[st.turn].id === 'a') {
      if (st.phase === 'playing') room.roll('a');
      if (st.phase === 'choosingPath') room.choosePath('a', st.pathChoice!.options[0]);
      if (st.phase === 'store') room.closeStore('a');
      if (st.phase === 'goldCoin') room.resolveGoldCoin('a', false);
      if (st.phase === 'trivia') room.answerTrivia('a', 0);
    }
    t.mock.timers.tick(250);
  }
  assert.equal(room.state.phase, 'ended');
  assert.ok(cpuMoved && cpuChose);
});

test('freeze skips the first player of a new round and cannot be bypassed by rolling again', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const room = setup(); t.after(() => room.close());
  room.state.players[0].frozenTurns = 1;
  assert.ok(room.roll('a').ok);
  assert.equal(room.roll('a').ok, false);
  assert.equal(room.state.players[0].frozenTurns, 0);
  t.mock.timers.tick(650);
  assert.equal(room.state.turn, 1);
  assert.equal(room.state.players[0].pos, 0);
});

for (const theme of BOARD_THEMES) test(`complete four-round match on ${theme.id}, including last minigame and replay`, (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000000 });
  // Seeded random avoids a lucky run hiding a permanently broken route.
  let seed = 12345;
  t.mock.method(Math, 'random', () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296));
  const room = new Room('FULL'); t.after(() => room.close());
  for (let i = 0; i < 8; i++) room.join(String(i), `P${i}`, 'bob');
  room.start('0', 4, theme.id);
  let lastRoundMinigame = false;
  for (let i = 0; i < 40000 && room.state.phase !== 'ended'; i++) {
    const st = room.state; const player = st.players[st.turn];
    if (st.phase === 'playing') room.roll(player.id);
    else if (st.phase === 'choosingPath') room.choosePath(player.id, st.pathChoice!.options[Math.floor(Math.random() * st.pathChoice!.options.length)]);
    else if (st.phase === 'store') room.closeStore(player.id);
    else if (st.phase === 'goldCoin') room.resolveGoldCoin(player.id, player.coins >= 20);
    else if (st.phase === 'trivia') room.answerTrivia(player.id, 0);
    else if (st.phase === 'minigame') {
      if (st.round === 4 && !st.minigame!.endsRound) lastRoundMinigame = true;
      const mg = st.minigame!;
      if (mg.kind === 'memory') {
        const index = mg.cards.findIndex((_, j) => !mg.revealed.includes(j) && !mg.matched.includes(j));
        if (index >= 0) room.flipCard('0', index);
      } else for (const coin of mg.coins) room.claim('0', coin.id);
    }
    assert.ok(st.players.every((p) => p.coins >= 0 && p.pos >= 0 && p.pos < st.board.length));
    t.mock.timers.tick(250);
  }
  assert.equal(room.state.phase, 'ended');
  assert.ok(lastRoundMinigame);
  assert.ok(room.start('0', 4, theme.id).ok);
  assert.equal(room.state.phase, 'playing');
  assert.ok(room.state.players.every((p) => p.pos === 0 && p.coins === 10));
});
