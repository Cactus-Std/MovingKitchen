import type {
  DeviceId,
  GameState,
  Player,
  PlayerColor,
  PlayerId,
  Room,
  RoomCode,
  RoomError,
} from './types.js';

export interface CreateRoomPayload {
  deviceId: DeviceId;
}
export interface JoinRoomPayload {
  roomCode: RoomCode;
  deviceId: DeviceId;
}
export interface LeaveRoomPayload {
  roomCode: RoomCode;
  deviceId: DeviceId;
}
export interface AddPlayerPayload {
  roomCode: RoomCode;
  name: string;
  color: PlayerColor;
}
export interface EnrollPlayerPayload {
  roomCode: RoomCode;
  playerId: PlayerId;
  embedding: number[];
}
export interface PresenceUpdatePayload {
  roomCode: RoomCode;
  deviceId: DeviceId;
  playerId: PlayerId | null;
  confidence: number | null;
  timestamp: number;
}
export interface GameActionPayload {
  roomCode: RoomCode;
  deviceId: DeviceId;
  type: 'DEMO_ACTION';
}
export interface GameStartPayload {
  roomCode: RoomCode;
  deviceId: DeviceId;
}

export interface ClientToServerEvents {
  'room:create': (payload: CreateRoomPayload) => void;
  'room:join': (payload: JoinRoomPayload) => void;
  'room:leave': (payload: LeaveRoomPayload) => void;
  'player:add': (payload: AddPlayerPayload) => void;
  'player:enroll': (payload: EnrollPlayerPayload) => void;
  'game:start': (payload: GameStartPayload) => void;
  'game:action': (payload: GameActionPayload) => void;
  'presence:update': (payload: PresenceUpdatePayload) => void;
}

export interface ServerToClientEvents {
  'room:created': (room: Room) => void;
  'room:state': (room: Room) => void;
  'room:error': (error: RoomError) => void;
  'player:joined': (player: Player) => void;
  'player:updated': (player: Player) => void;
  'game:started': (gameState: GameState) => void;
  'game:state': (gameState: GameState) => void;
  'presence:state': (presence: Room['devicePresence']) => void;
}

export type InterServerEvents = Record<never, never>;
export interface SocketData {
  roomCode?: RoomCode;
  deviceId?: DeviceId;
}
