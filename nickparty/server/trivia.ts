import questions from './trivia.json' with { type: 'json' };
import type { BoardThemeId, TriviaQuestion } from '../shared/game.js';

export function randomTrivia(theme: BoardThemeId): TriviaQuestion {
  const bank = questions as Record<string, TriviaQuestion[]>;
  const choices = bank[theme === 'spongeBob' ? 'bob' : theme] ?? bank.bob;
  return structuredClone(choices[Math.floor(Math.random() * choices.length)]);
}
