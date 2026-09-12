import type { Player } from '@roaming/shared';
import { describe, expect, it } from 'vitest';
import { advanceTurn, startGame } from './gameEngine.js';

const players: Player[] = [
  { id: 'jack', name: 'Jack', color: 'red', enrolled: false },
  { id: 'amy', name: 'Amy', color: 'blue', enrolled: false },
];

describe('game engine', () => {
  it('starts with the first player', () => {
    expect(startGame(players).currentTurnPlayerId).toBe('jack');
  });

  it('scores the acting player and rotates turns', () => {
    const next = advanceTurn(startGame(players), players);
    expect(next.currentTurnPlayerId).toBe('amy');
    expect(next.demoScore.jack).toBe(1);
    expect(next.turnNumber).toBe(2);
  });
});
