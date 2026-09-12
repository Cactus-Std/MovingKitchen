import { MIN_PLAYERS, type GameState, type Player } from '@roaming/shared';
import { RoomManagerError } from './types.js';

export function createInitialGameState(): GameState {
  return {
    status: 'lobby',
    currentTurnPlayerId: null,
    turnNumber: 0,
    demoScore: {},
  };
}

export function startGame(players: Player[]): GameState {
  if (players.length < MIN_PLAYERS) {
    throw new RoomManagerError(
      'NOT_ENOUGH_PLAYERS',
      `At least ${MIN_PLAYERS} players are required to start.`,
    );
  }

  return {
    status: 'playing',
    currentTurnPlayerId: players[0]?.id ?? null,
    turnNumber: 1,
    demoScore: Object.fromEntries(players.map((player) => [player.id, 0])),
  };
}

export function advanceTurn(
  gameState: GameState,
  players: Player[],
): GameState {
  if (gameState.status !== 'playing' || !gameState.currentTurnPlayerId) {
    throw new RoomManagerError(
      'INVALID_REQUEST',
      'The game is not currently playing.',
    );
  }

  const currentIndex = players.findIndex(
    (player) => player.id === gameState.currentTurnPlayerId,
  );
  const currentPlayer = players[currentIndex];
  const nextPlayer = players[(currentIndex + 1) % players.length];
  if (!currentPlayer || !nextPlayer) {
    throw new RoomManagerError(
      'INVALID_REQUEST',
      'The turn order is unavailable.',
    );
  }

  return {
    ...gameState,
    currentTurnPlayerId: nextPlayer.id,
    turnNumber: gameState.turnNumber + 1,
    demoScore: {
      ...gameState.demoScore,
      [currentPlayer.id]: (gameState.demoScore[currentPlayer.id] ?? 0) + 1,
    },
  };
}
