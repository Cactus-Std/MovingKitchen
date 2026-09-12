import {
  generateRoomCode,
  isValidRoomCode,
  MAX_PLAYERS,
  normalizeRoomCode,
  PRESENCE_EXPIRATION_MS,
  type DeviceId,
  type PlayerColor,
  type Room,
  type RoomCode,
} from '@roaming/shared';
import { randomUUID } from 'node:crypto';
import {
  advanceTurn,
  createInitialGameState,
  startGame,
} from './gameEngine.js';
import { RoomManagerError } from './types.js';

interface InternalRoom {
  room: Room;
  socketsByDevice: Map<DeviceId, Set<string>>;
}

export class RoomManager {
  private readonly rooms = new Map<RoomCode, InternalRoom>();

  createRoom(deviceId: DeviceId, socketId: string): Room {
    if (!deviceId.trim()) {
      throw new RoomManagerError('INVALID_REQUEST', 'A device ID is required.');
    }

    let code = generateRoomCode();
    while (this.rooms.has(code)) code = generateRoomCode();

    const internalRoom: InternalRoom = {
      room: {
        code,
        hostDeviceId: deviceId,
        players: [],
        gameState: createInitialGameState(),
        devicePresence: {},
        connectedDeviceIds: [],
        createdAt: Date.now(),
      },
      socketsByDevice: new Map(),
    };

    this.rooms.set(code, internalRoom);
    return this.joinRoom(code, deviceId, socketId);
  }

  joinRoom(roomCode: RoomCode, deviceId: DeviceId, socketId: string): Room {
    const code = normalizeRoomCode(roomCode);
    if (!isValidRoomCode(code)) {
      throw new RoomManagerError(
        'INVALID_ROOM_CODE',
        'Enter a valid four-character room code.',
      );
    }
    if (!deviceId.trim()) {
      throw new RoomManagerError('INVALID_REQUEST', 'A device ID is required.');
    }

    const internalRoom = this.rooms.get(code);
    if (!internalRoom) {
      throw new RoomManagerError(
        'ROOM_NOT_FOUND',
        `Room ${code} was not found.`,
      );
    }

    const socketIds =
      internalRoom.socketsByDevice.get(deviceId) ?? new Set<string>();
    socketIds.add(socketId);
    internalRoom.socketsByDevice.set(deviceId, socketIds);
    this.syncConnectedDevices(internalRoom);
    return this.snapshot(internalRoom.room);
  }

  leaveSocket(
    roomCode: RoomCode,
    deviceId: DeviceId,
    socketId: string,
  ): Room | null {
    const internalRoom = this.rooms.get(normalizeRoomCode(roomCode));
    if (!internalRoom) return null;

    const socketIds = internalRoom.socketsByDevice.get(deviceId);
    socketIds?.delete(socketId);
    if (socketIds?.size === 0) {
      internalRoom.socketsByDevice.delete(deviceId);
      delete internalRoom.room.devicePresence[deviceId];
    }
    this.syncConnectedDevices(internalRoom);
    return this.snapshot(internalRoom.room);
  }

  getRoom(roomCode: RoomCode): Room | null {
    const internalRoom = this.rooms.get(normalizeRoomCode(roomCode));
    return internalRoom ? this.snapshot(internalRoom.room) : null;
  }

  addPlayer(roomCode: RoomCode, name: string, color: PlayerColor): Room {
    const internalRoom = this.requireRoom(roomCode);
    const normalizedName = name.trim();
    if (internalRoom.room.gameState.status !== 'lobby') {
      throw new RoomManagerError(
        'GAME_ALREADY_STARTED',
        'Players cannot join after the game starts.',
      );
    }
    if (!normalizedName || normalizedName.length > 24) {
      throw new RoomManagerError(
        'INVALID_REQUEST',
        'Player name must be between 1 and 24 characters.',
      );
    }
    if (internalRoom.room.players.length >= MAX_PLAYERS) {
      throw new RoomManagerError(
        'ROOM_FULL',
        'This room already has four players.',
      );
    }
    if (internalRoom.room.players.some((player) => player.color === color)) {
      throw new RoomManagerError(
        'COLOR_ALREADY_TAKEN',
        `${color} is already taken.`,
      );
    }
    if (
      internalRoom.room.players.some(
        (player) => player.name.toLowerCase() === normalizedName.toLowerCase(),
      )
    ) {
      throw new RoomManagerError(
        'PLAYER_NAME_TAKEN',
        `${normalizedName} is already in this room.`,
      );
    }

    internalRoom.room.players.push({
      id: randomUUID(),
      name: normalizedName,
      color,
      enrolled: false,
    });
    return this.snapshot(internalRoom.room);
  }

  startGame(roomCode: RoomCode, deviceId: DeviceId): Room {
    const internalRoom = this.requireRoom(roomCode);
    if (internalRoom.room.hostDeviceId !== deviceId) {
      throw new RoomManagerError(
        'NOT_AUTHORIZED',
        'Only the room host can start the game.',
      );
    }
    if (internalRoom.room.gameState.status !== 'lobby') {
      throw new RoomManagerError(
        'GAME_ALREADY_STARTED',
        'The game has already started.',
      );
    }
    internalRoom.room.gameState = startGame(internalRoom.room.players);
    return this.snapshot(internalRoom.room);
  }

  updatePresence(
    roomCode: RoomCode,
    deviceId: DeviceId,
    playerId: string | null,
    confidence: number | null,
    now = Date.now(),
  ): Room {
    const internalRoom = this.requireRoom(roomCode);
    if (!internalRoom.socketsByDevice.has(deviceId)) {
      throw new RoomManagerError(
        'NOT_AUTHORIZED',
        'This device is not connected to the room.',
      );
    }
    if (
      playerId !== null &&
      !internalRoom.room.players.some((player) => player.id === playerId)
    ) {
      throw new RoomManagerError(
        'INVALID_REQUEST',
        'The recognized player is not in this room.',
      );
    }
    if (
      confidence !== null &&
      (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)
    ) {
      throw new RoomManagerError(
        'INVALID_REQUEST',
        'Presence confidence must be between zero and one.',
      );
    }

    internalRoom.room.devicePresence[deviceId] = {
      deviceId,
      recognizedPlayerId: playerId,
      confidence: playerId === null ? null : confidence,
      lastSeenAt: now,
    };
    return this.snapshot(internalRoom.room);
  }

  performDemoAction(
    roomCode: RoomCode,
    deviceId: DeviceId,
    now = Date.now(),
  ): Room {
    const internalRoom = this.requireRoom(roomCode);
    const presence = internalRoom.room.devicePresence[deviceId];
    const currentPlayerId = internalRoom.room.gameState.currentTurnPlayerId;
    if (
      !presence ||
      !presence.recognizedPlayerId ||
      presence.recognizedPlayerId !== currentPlayerId ||
      now - presence.lastSeenAt > PRESENCE_EXPIRATION_MS
    ) {
      throw new RoomManagerError(
        'NOT_AUTHORIZED',
        'A fresh recognition of the current player is required.',
      );
    }
    internalRoom.room.gameState = advanceTurn(
      internalRoom.room.gameState,
      internalRoom.room.players,
    );
    return this.snapshot(internalRoom.room);
  }

  enrollPlayer(
    roomCode: RoomCode,
    playerId: string,
    embedding: number[],
  ): Room {
    const internalRoom = this.requireRoom(roomCode);
    const player = internalRoom.room.players.find(
      (candidate) => candidate.id === playerId,
    );
    if (!player) {
      throw new RoomManagerError('INVALID_REQUEST', 'Player was not found.');
    }
    if (
      embedding.length !== 512 ||
      embedding.some((value) => !Number.isFinite(value))
    ) {
      throw new RoomManagerError(
        'INVALID_REQUEST',
        'Face embedding must contain 512 finite values.',
      );
    }
    const magnitude = Math.sqrt(
      embedding.reduce((sum, value) => sum + value * value, 0),
    );
    if (magnitude < 0.99 || magnitude > 1.01) {
      throw new RoomManagerError(
        'INVALID_REQUEST',
        'Face embedding must be L2 normalized.',
      );
    }

    player.faceEmbedding = [...embedding];
    player.enrolled = true;
    return this.snapshot(internalRoom.room);
  }

  private syncConnectedDevices(internalRoom: InternalRoom): void {
    internalRoom.room.connectedDeviceIds = [
      ...internalRoom.socketsByDevice.keys(),
    ];
  }

  private requireRoom(roomCode: RoomCode): InternalRoom {
    const code = normalizeRoomCode(roomCode);
    const internalRoom = this.rooms.get(code);
    if (!internalRoom) {
      throw new RoomManagerError(
        'ROOM_NOT_FOUND',
        `Room ${code} was not found.`,
      );
    }
    return internalRoom;
  }

  private snapshot(room: Room): Room {
    return structuredClone(room);
  }
}
