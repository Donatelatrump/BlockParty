import { simonWindow } from '../shared/minigames.js';
import type { RoomState } from '../shared/game.js';

/** Only public information crosses the websocket boundary. */
export function publicState(state: RoomState): RoomState {
  const result = structuredClone(state);
  if (result.trivia) {
    result.trivia.question.answers = result.trivia.question.answers.map(({ text }) => ({ text }));
  }
  if (result.minigame?.kind === 'memory') {
    const mg = result.minigame;
    mg.cards = mg.cards.map((face, i) => mg.revealed.includes(i) || mg.matched.includes(i) ? face : -1);
  }
  if (result.minigame?.kind === 'simon' && result.minigame.arena) {
    const mg = result.minigame;
    const elapsed = Date.now() - (mg.startsAt ?? 0);
    const window = simonWindow(Math.max(0, elapsed));
    mg.arena!.sequence = mg.arena!.sequence.map((value, i) => elapsed >= 0 && window.showing && window.lit && i === window.index ? value : -1);
  }
  return result;
}
