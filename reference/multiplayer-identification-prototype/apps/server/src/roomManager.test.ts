import { describe, expect, it } from 'vitest';
import { RoomManager } from './roomManager.js';

describe('RoomManager', () => {
  it('creates a room and tracks the creating device', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('device-a', 'socket-a');
    expect(room.code).toHaveLength(4);
    expect(room.connectedDeviceIds).toEqual(['device-a']);
    expect(room.gameState.status).toBe('lobby');
  });

  it('joins an existing room and removes only the disconnected socket', () => {
    const manager = new RoomManager();
    const created = manager.createRoom('device-a', 'socket-a');
    manager.joinRoom(created.code, 'device-b', 'socket-b');
    const room = manager.leaveSocket(created.code, 'device-a', 'socket-a');
    expect(room?.connectedDeviceIds).toEqual(['device-b']);
  });

  it('rejects a missing room', () => {
    const manager = new RoomManager();
    expect(() => manager.joinRoom('AB23', 'device-a', 'socket-a')).toThrow(
      'Room AB23 was not found.',
    );
  });

  it('enforces unique colors', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('host', 'socket-a');
    manager.addPlayer(room.code, 'Jack', 'red');
    expect(() => manager.addPlayer(room.code, 'Amy', 'red')).toThrow(
      'red is already taken.',
    );
  });

  it('allows only the host to start with at least two players', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('host', 'socket-a');
    manager.addPlayer(room.code, 'Jack', 'red');
    manager.addPlayer(room.code, 'Amy', 'blue');
    expect(() => manager.startGame(room.code, 'guest')).toThrow(
      'Only the room host',
    );
    expect(
      manager.startGame(room.code, 'host').gameState.currentTurnPlayerId,
    ).toBeTruthy();
  });

  it('stores only a normalized 512-dimensional enrollment embedding', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('host', 'socket-a');
    const withPlayer = manager.addPlayer(room.code, 'Jack', 'red');
    const playerId = withPlayer.players[0]?.id ?? '';
    const embedding = new Array<number>(512).fill(0);
    embedding[0] = 1;
    const enrolled = manager.enrollPlayer(room.code, playerId, embedding);
    expect(enrolled.players[0]?.enrolled).toBe(true);
    expect(enrolled.players[0]?.faceEmbedding).toEqual(embedding);
    expect(() => manager.enrollPlayer(room.code, playerId, [1])).toThrow(
      '512 finite values',
    );
  });

  it('authorizes an action only for fresh presence matching the turn', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('device-a', 'socket-a');
    manager.joinRoom(room.code, 'device-b', 'socket-b');
    const withFirst = manager.addPlayer(room.code, 'Jack', 'red');
    const withSecond = manager.addPlayer(room.code, 'Amy', 'blue');
    const jackId = withFirst.players[0]?.id ?? '';
    const amyId = withSecond.players[1]?.id ?? '';
    manager.startGame(room.code, 'device-a');

    manager.updatePresence(room.code, 'device-a', jackId, 0.9, 1_000);
    expect(
      manager.performDemoAction(room.code, 'device-a', 2_999).gameState
        .currentTurnPlayerId,
    ).toBe(amyId);
  });

  it('rejects an action from the wrong recognized player', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('device-a', 'socket-a');
    const withFirst = manager.addPlayer(room.code, 'Jack', 'red');
    const withSecond = manager.addPlayer(room.code, 'Amy', 'blue');
    const jackId = withFirst.players[0]?.id ?? '';
    const amyId = withSecond.players[1]?.id ?? '';
    manager.startGame(room.code, 'device-a');
    manager.updatePresence(room.code, 'device-a', amyId, 0.9, 1_000);

    expect(() =>
      manager.performDemoAction(room.code, 'device-a', 1_500),
    ).toThrow('fresh recognition');
    expect(jackId).not.toBe(amyId);
  });

  it('rejects an action when presence is older than two seconds', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('device-a', 'socket-a');
    const withFirst = manager.addPlayer(room.code, 'Jack', 'red');
    manager.addPlayer(room.code, 'Amy', 'blue');
    const jackId = withFirst.players[0]?.id ?? '';
    manager.startGame(room.code, 'device-a');
    manager.updatePresence(room.code, 'device-a', jackId, 0.9, 1_000);

    expect(() =>
      manager.performDemoAction(room.code, 'device-a', 3_001),
    ).toThrow('fresh recognition');
  });
});
