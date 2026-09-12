export type PlayerColor = 'red' | 'blue' | 'green' | 'yellow';
export type PlayerId = string;
export type DeviceId = string;
export type RoomCode = string;

export interface Player {
  id: PlayerId;
  name: string;
  color: PlayerColor;
  enrolled: boolean;
  faceEmbedding?: number[];
}

export interface DevicePresence {
  deviceId: DeviceId;
  recognizedPlayerId: PlayerId | null;
  confidence: number | null;
  lastSeenAt: number;
}

export interface GameState {
  status: 'lobby' | 'playing' | 'finished';
  currentTurnPlayerId: PlayerId | null;
  turnNumber: number;
  demoScore: Record<PlayerId, number>;
}

export interface Room {
  code: RoomCode;
  hostDeviceId: DeviceId;
  players: Player[];
  gameState: GameState;
  devicePresence: Record<DeviceId, DevicePresence>;
  connectedDeviceIds: DeviceId[];
  createdAt: number;
}

export type RoomErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'COLOR_ALREADY_TAKEN'
  | 'PLAYER_NAME_TAKEN'
  | 'INVALID_ROOM_CODE'
  | 'INVALID_REQUEST'
  | 'GAME_ALREADY_STARTED'
  | 'NOT_ENOUGH_PLAYERS'
  | 'NOT_AUTHORIZED'
  | 'INTERNAL_ERROR';

export interface RoomError {
  code: RoomErrorCode;
  message: string;
}
