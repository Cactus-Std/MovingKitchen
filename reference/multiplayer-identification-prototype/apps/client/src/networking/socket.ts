import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@roaming/shared';
import { io, type Socket } from 'socket.io-client';
import { SERVER_URL } from '../config/env';
import { useConnectionStore } from '../stores/connectionStore';
import { useRoomStore } from '../stores/roomStore';
import { useVisionStore } from '../stores/visionStore';

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  SERVER_URL,
  {
    autoConnect: false,
    reconnection: true,
  },
);

let initialized = false;

export function initializeSocket(): () => void {
  if (!initialized) {
    socket.on('connect', () => {
      const connection = useConnectionStore.getState();
      connection.setStatus('connected');
      if (connection.roomCode) {
        socket.emit('room:join', {
          roomCode: connection.roomCode,
          deviceId: connection.deviceId,
        });
      }
    });
    socket.on('disconnect', () =>
      useConnectionStore.getState().setStatus('disconnected'),
    );
    socket.on('connect_error', () =>
      useConnectionStore.getState().setStatus('disconnected'),
    );
    socket.on('room:created', (room) => {
      useConnectionStore.getState().setRoomCode(room.code);
      useRoomStore.getState().setRoom(room);
    });
    socket.on('room:state', (room) => {
      useConnectionStore.getState().setRoomCode(room.code);
      useRoomStore.getState().setRoom(room);
    });
    socket.on('room:error', (error) => {
      if (error.code === 'ROOM_NOT_FOUND') {
        useConnectionStore.getState().setRoomCode(null);
        useRoomStore.getState().setRoom(null);
      }
      useRoomStore.getState().setError(error);
    });
    socket.on('presence:state', (presence) => {
      useRoomStore.getState().setPresence(presence);
    });
    initialized = true;
  }

  socket.connect();
  return () => socket.disconnect();
}

export function createRoom(): void {
  const { deviceId } = useConnectionStore.getState();
  useRoomStore.getState().setPending(true);
  socket.emit('room:create', { deviceId });
}

export function joinRoom(roomCode: string): void {
  const { deviceId } = useConnectionStore.getState();
  useRoomStore.getState().setPending(true);
  socket.emit('room:join', {
    roomCode: roomCode.trim().toUpperCase(),
    deviceId,
  });
}

export function leaveRoom(): void {
  const { deviceId, roomCode, setRoomCode } = useConnectionStore.getState();
  if (roomCode) socket.emit('room:leave', { roomCode, deviceId });
  setRoomCode(null);
  const roomStore = useRoomStore.getState();
  roomStore.setEnrollingPlayerId(null);
  roomStore.setRoom(null);
  useVisionStore.getState().resetIdentity();
}

export function addPlayer(
  name: string,
  color: 'red' | 'blue' | 'green' | 'yellow',
): void {
  const { roomCode } = useConnectionStore.getState();
  if (!roomCode) return;
  useRoomStore.getState().setPending(true);
  socket.emit('player:add', { roomCode, name, color });
}

export function startGame(): void {
  const { roomCode, deviceId } = useConnectionStore.getState();
  if (!roomCode) return;
  useRoomStore.getState().setPending(true);
  socket.emit('game:start', { roomCode, deviceId });
}

export function performDemoAction(): void {
  const { roomCode, deviceId } = useConnectionStore.getState();
  if (!roomCode) return;
  useRoomStore.getState().setPending(true);
  socket.emit('game:action', { roomCode, deviceId, type: 'DEMO_ACTION' });
}

export function enrollPlayer(playerId: string, embedding: number[]): void {
  const { roomCode } = useConnectionStore.getState();
  if (!roomCode) return;
  useRoomStore.getState().setPending(true);
  socket.emit('player:enroll', { roomCode, playerId, embedding });
}

export function updatePresence(
  playerId: string | null,
  confidence: number | null,
): void {
  const { roomCode, deviceId } = useConnectionStore.getState();
  if (!roomCode || !socket.connected) return;
  socket.emit('presence:update', {
    roomCode,
    deviceId,
    playerId,
    confidence,
    timestamp: Date.now(),
  });
}
