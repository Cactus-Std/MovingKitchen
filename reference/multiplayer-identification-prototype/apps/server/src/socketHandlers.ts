import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
  RoomError,
} from '@roaming/shared';
import type { Server, Socket } from 'socket.io';
import type { RoomManager } from './roomManager.js';
import { RoomManagerError } from './types.js';

type GameServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
type GameSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

function emitError(socket: GameSocket, error: unknown): void {
  const roomError: RoomError =
    error instanceof RoomManagerError
      ? { code: error.code, message: error.message }
      : {
          code: 'INTERNAL_ERROR',
          message: 'The server could not complete that request.',
        };
  socket.emit('room:error', roomError);
}

async function leaveCurrentRoom(
  io: GameServer,
  socket: GameSocket,
  roomManager: RoomManager,
): Promise<void> {
  const { roomCode, deviceId } = socket.data;
  if (!roomCode || !deviceId) return;

  await socket.leave(roomCode);
  const room = roomManager.leaveSocket(roomCode, deviceId, socket.id);
  socket.data.roomCode = undefined;
  socket.data.deviceId = undefined;
  if (room) io.to(roomCode).emit('room:state', room);
}

export function registerSocketHandlers(
  io: GameServer,
  roomManager: RoomManager,
): void {
  io.on('connection', (socket) => {
    socket.on('room:create', async ({ deviceId }) => {
      try {
        await leaveCurrentRoom(io, socket, roomManager);
        const room = roomManager.createRoom(deviceId, socket.id);
        socket.data = { roomCode: room.code, deviceId };
        await socket.join(room.code);
        socket.emit('room:created', room);
        io.to(room.code).emit('room:state', room);
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on('room:join', async ({ roomCode, deviceId }) => {
      try {
        await leaveCurrentRoom(io, socket, roomManager);
        const room = roomManager.joinRoom(roomCode, deviceId, socket.id);
        socket.data = { roomCode: room.code, deviceId };
        await socket.join(room.code);
        io.to(room.code).emit('room:state', room);
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on('room:leave', async () => {
      await leaveCurrentRoom(io, socket, roomManager);
    });

    socket.on('player:add', ({ roomCode, name, color }) => {
      try {
        const room = roomManager.addPlayer(roomCode, name, color);
        const player = room.players.at(-1);
        if (player) io.to(room.code).emit('player:joined', player);
        io.to(room.code).emit('room:state', room);
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on('player:enroll', ({ roomCode, playerId, embedding }) => {
      try {
        const room = roomManager.enrollPlayer(roomCode, playerId, embedding);
        const player = room.players.find(
          (candidate) => candidate.id === playerId,
        );
        if (player) io.to(room.code).emit('player:updated', player);
        io.to(room.code).emit('room:state', room);
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on('game:start', ({ roomCode, deviceId }) => {
      try {
        const room = roomManager.startGame(roomCode, deviceId);
        io.to(room.code).emit('game:started', room.gameState);
        io.to(room.code).emit('room:state', room);
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on(
      'presence:update',
      ({ roomCode, deviceId, playerId, confidence }) => {
        try {
          if (
            socket.data.roomCode !== roomCode ||
            socket.data.deviceId !== deviceId
          ) {
            throw new RoomManagerError(
              'NOT_AUTHORIZED',
              'Presence can only be updated by the connected device.',
            );
          }
          const room = roomManager.updatePresence(
            roomCode,
            deviceId,
            playerId,
            confidence,
          );
          io.to(room.code).emit('presence:state', room.devicePresence);
        } catch (error) {
          emitError(socket, error);
        }
      },
    );

    socket.on('game:action', ({ roomCode, deviceId }) => {
      try {
        if (
          socket.data.roomCode !== roomCode ||
          socket.data.deviceId !== deviceId
        ) {
          throw new RoomManagerError(
            'NOT_AUTHORIZED',
            'Actions can only be sent by the connected device.',
          );
        }
        const room = roomManager.performDemoAction(roomCode, deviceId);
        io.to(room.code).emit('game:state', room.gameState);
        io.to(room.code).emit('room:state', room);
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on('disconnect', () => {
      const { roomCode, deviceId } = socket.data;
      if (!roomCode || !deviceId) return;
      const room = roomManager.leaveSocket(roomCode, deviceId, socket.id);
      if (room) io.to(roomCode).emit('room:state', room);
    });
  });
}
