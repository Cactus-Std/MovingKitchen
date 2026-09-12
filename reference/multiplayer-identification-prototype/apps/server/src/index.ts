import { createServer } from 'node:http';
import {
  DEFAULT_SERVER_HOST,
  DEFAULT_SERVER_PORT,
  type ClientToServerEvents,
  type InterServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from '@roaming/shared';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import { RoomManager } from './roomManager.js';
import { registerSocketHandlers } from './socketHandlers.js';

const host = process.env.HOST ?? DEFAULT_SERVER_HOST;
const port = Number(process.env.PORT ?? DEFAULT_SERVER_PORT);
const app = express();

app.use(cors());
app.use(express.json());
app.get('/health', (_request, response) => {
  response.json({ status: 'ok', timestamp: Date.now() });
});

const httpServer = createServer(app);
const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(httpServer, {
  cors: { origin: true, credentials: true },
});

registerSocketHandlers(io, new RoomManager());

httpServer.listen(port, host, () => {
  console.log(`Roaming Player server listening on http://${host}:${port}`);
});
