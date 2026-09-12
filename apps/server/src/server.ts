import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { Server, type Socket } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  CommandAck,
  RoomState,
} from "@kitchen/shared";
import { Rooms } from "./rooms.js";
import { GameError, requireRule as check } from "./errors.js";
type GameSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;
export function createGameServer(
  options: {
    allowDebug?: boolean;
    origins?: string[];
    staticDir?: string;
    clock?: () => number;
  } = {},
) {
  const app = express();
  const http = createServer(app);
  const origins = options.origins ?? [
    "http://localhost:5180",
    "http://127.0.0.1:5180",
  ];
  const origin = (
    value: string | undefined,
    done: (err: Error | null, allowed?: boolean) => void,
  ) => done(null, !value || origins.includes(value));
  app.use(cors({ origin }));
  app.get("/health", (_req, res) =>
    res.json({ ok: true, service: "moving-kitchen" }),
  );
  app.get("/api/config", (_req, res) =>
    res.json({ allowDebug: options.allowDebug ?? false }),
  );
  if (options.staticDir) {
    app.use(express.static(options.staticDir));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(resolve(options.staticDir!, "index.html")),
    );
  }
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >(http, { cors: { origin }, maxHttpBufferSize: 64 * 1024 });
  const rooms = new Rooms(options.allowDebug, options.clock);
  const broadcast = (room: RoomState) =>
    io.to(room.code).emit("room:state", room);
  const leave = (socket: GameSocket) => {
    const { roomCode, deviceId } = socket.data;
    if (roomCode && deviceId) {
      socket.leave(roomCode);
      broadcast(rooms.leave(roomCode, deviceId, socket.id));
    }
    socket.data = {};
  };
  io.on("connection", (socket) => {
    let commands = 0;
    let resetAt = Date.now();
    const deduplicated = new Set([
      "player:add",
      "player:enroll",
      "game:start",
      "game:restart",
      "station:select",
    ]);
    const register = <E extends keyof ClientToServerEvents>(
      event: E,
      handler: (
        payload: Parameters<ClientToServerEvents[E]>[0],
      ) => RoomState | null,
      membership = true,
    ) => {
      const listener = (
        payload: Parameters<ClientToServerEvents[E]>[0],
        ack: (result: CommandAck<RoomState | null>) => void,
      ) => {
        try {
          check(
            payload && typeof payload === "object",
            "INVALID_REQUEST",
            "请求格式无效。",
          );
          check(
            payload.protocolVersion === 1,
            "UNSUPPORTED_PROTOCOL",
            "请刷新到当前版本。",
          );
          check(
            typeof payload.requestId === "string" &&
              payload.requestId.length > 0 &&
              payload.requestId.length <= 128 &&
              typeof payload.deviceId === "string" &&
              payload.deviceId.length > 0 &&
              payload.deviceId.length <= 128,
            "INVALID_REQUEST",
            "缺少请求或设备 ID。",
          );
          check(
            !["__proto__", "constructor", "prototype"].includes(
              payload.deviceId,
            ),
            "INVALID_REQUEST",
            "设备 ID 无效。",
          );
          if (Date.now() - resetAt > 1000) {
            commands = 0;
            resetAt = Date.now();
          }
          check(++commands <= 30, "RATE_LIMITED", "请求过于频繁。");
          if (membership)
            check(
              "roomCode" in payload &&
                socket.data.roomCode === payload.roomCode &&
                socket.data.deviceId === payload.deviceId,
              "NOT_AUTHORIZED",
              "请先用当前设备加入房间。",
            );
          const entry =
            membership && "roomCode" in payload
              ? rooms.get(payload.roomCode)
              : null;
          const key = `${payload.deviceId}:${payload.requestId}`;
          const fingerprint = deduplicated.has(event)
            ? createHash("sha256")
                .update(JSON.stringify({ event, payload }))
                .digest("hex")
            : null;
          const previous = fingerprint ? entry?.requests.get(key) : undefined;
          if (previous) {
            check(
              previous === fingerprint,
              "INVALID_REQUEST",
              "同一个请求 ID 不能用于不同操作。",
            );
            if (typeof ack === "function")
              ack({ ok: true, data: entry!.state });
            return;
          }
          const state = handler(payload);
          if (fingerprint) entry?.requests.set(key, fingerprint);
          if (state) broadcast(state);
          if (typeof ack === "function") ack({ ok: true, data: state });
        } catch (error) {
          const known = error instanceof GameError;
          const result: CommandAck<never> = {
            ok: false,
            error: {
              requestId: payload?.requestId ?? null,
              code: known ? error.code : "INTERNAL_ERROR",
              message: known ? error.message : "服务器暂时无法处理请求。",
              retryable:
                known &&
                ["REVISION_CONFLICT", "RATE_LIMITED"].includes(error.code),
            },
          };
          if (typeof ack === "function") ack(result);
          if (socket.data.roomCode)
            socket.emit("room:state", rooms.get(socket.data.roomCode).state);
        }
      };
      const on = socket.on.bind(socket) as <
        T extends keyof ClientToServerEvents,
      >(
        event: T,
        listener: ClientToServerEvents[T],
      ) => GameSocket;
      on(event, listener as ClientToServerEvents[E]);
    };
    register(
      "room:create",
      (p) => {
        check(!socket.data.roomCode, "INVALID_REQUEST", "请先退出当前房间。");
        const r = rooms.create(
          p.deviceId,
          socket.id,
          p.stationId,
          p.debugMode === true,
        );
        socket.data = { roomCode: r.code, deviceId: p.deviceId };
        socket.join(r.code);
        return r;
      },
      false,
    );
    register(
      "room:join",
      (p) => {
        check(
          !socket.data.roomCode ||
            (socket.data.roomCode === p.roomCode &&
              socket.data.deviceId === p.deviceId),
          "INVALID_REQUEST",
          "请先退出当前房间。",
        );
        const r = rooms.join(p.roomCode, p.deviceId, socket.id, p.stationId);
        socket.data = { roomCode: r.code, deviceId: p.deviceId };
        socket.join(r.code);
        socket.emit("identity:roster", rooms.get(r.code).roster);
        return r;
      },
      false,
    );
    register("room:leave", () => {
      leave(socket);
      return null;
    });
    register("player:add", (p) => rooms.add(p.roomCode, p.name, p.color));
    register("player:enroll", (p) => {
      const r = rooms.enroll(p.roomCode, p.playerId, p.template);
      io.to(r.code).emit("identity:roster", rooms.get(r.code).roster);
      return r;
    });
    register("game:start", (p) => rooms.start(p.roomCode, p.deviceId));
    register("game:restart", (p) => rooms.start(p.roomCode, p.deviceId, true));
    register("station:select", (p) => {
      const e = rooms.get(p.roomCode);
      check(
        e.state.debugMode || e.state.kitchen.status === "lobby",
        "NOT_AUTHORIZED",
        "游戏中工位固定，请移动到另一台电脑。",
      );
      rooms.bind(e, p.deviceId, p.stationId);
      return e.state;
    });
    register("identity:presence", (p) =>
      rooms.presence(
        p.roomCode,
        p.deviceId,
        p.playerId,
        p.confidence,
        p.evidence,
      ),
    );
    register("kitchen:action", (p) => rooms.action(p));
    register("state:resync", (p) => {
      const e = rooms.get(p.roomCode);
      socket.emit("identity:roster", e.roster);
      return e.state;
    });
    socket.on("disconnect", () => leave(socket));
  });
  const timer = setInterval(() => rooms.tick().forEach(broadcast), 500);
  timer.unref();
  return {
    app,
    http,
    io,
    rooms,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(timer);
        io.close(() => resolve());
      }),
  };
}
