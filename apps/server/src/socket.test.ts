// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { io, type Socket } from "socket.io-client";
import { createGameServer } from "./server.js";
import {
  STATIONS,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "@kitchen/shared";
let server: ReturnType<typeof createGameServer>;
let clients: Socket<ServerToClientEvents, ClientToServerEvents>[] = [];
afterEach(async () => {
  clients.forEach((c) => c.disconnect());
  clients = [];
  await server?.close();
});
it("accepts four concurrently emitted commands and keeps four independent player leases", async () => {
  server = createGameServer({ allowDebug: true });
  await new Promise<void>((resolve) =>
    server.http.listen(0, "127.0.0.1", resolve),
  );
  const port = (server.http.address() as { port: number }).port;
  clients = await Promise.all(
    STATIONS.map(
      () =>
        new Promise<Socket<ServerToClientEvents, ClientToServerEvents>>(
          (resolve) => {
            const socket: Socket<ServerToClientEvents, ClientToServerEvents> =
              io(`http://127.0.0.1:${port}`, {
                transports: ["websocket"],
                forceNew: true,
              });
            socket.once("connect", () => resolve(socket));
          },
        ),
    ),
  );
  const meta = (i: number) => ({
    protocolVersion: 1 as const,
    requestId: crypto.randomUUID(),
    deviceId: `d${i}`,
  });
  const created = await clients[0].emitWithAck("room:create", {
    ...meta(0),
    debugMode: true,
  });
  if (!created.ok) throw Error("create");
  const code = created.data.code;
  for (let i = 1; i < 4; i++)
    expect(
      (
        await clients[i].emitWithAck("room:join", {
          ...meta(i),
          roomCode: code,
        })
      ).ok,
    ).toBe(true);
  for (let i = 0; i < 4; i++) {
    await clients[i].emitWithAck("station:select", {
      ...meta(i),
      roomCode: code,
      stationId: STATIONS[i],
    });
    await clients[0].emitWithAck("player:add", {
      ...meta(0),
      roomCode: code,
      name: `Chef ${i}`,
      color: (["red", "blue", "green", "yellow"] as const)[i],
    });
  }
  const started = await clients[0].emitWithAck("game:start", {
    ...meta(0),
    roomCode: code,
  });
  if (!started.ok) throw Error("start");
  await Promise.all(
    clients.map((socket, i) =>
      socket.emitWithAck("identity:presence", {
        ...meta(i),
        roomCode: code,
        playerId: started.data.players[i].id,
        confidence: null,
        evidence: "manual-debug",
      }),
    ),
  );
  const synced = await clients[0].emitWithAck("state:resync", {
    ...meta(0),
    roomCode: code,
  });
  if (!synced.ok) throw Error("sync");
  const actions = [
    { type: "PICKUP_STORAGE", ingredient: "cheese" },
    { type: "PICKUP_ITEM", itemId: "board-1:knife" },
    { type: "PICKUP_ITEM", itemId: "board-2:knife" },
    { type: "PICKUP_ITEM", itemId: "oven-pass:oven-mitt" },
  ] as const;
  const results = await Promise.all(
    clients.map((socket, i) =>
      socket.emitWithAck("kitchen:action", {
        ...meta(i),
        roomCode: code,
        stationId: STATIONS[i],
        actionId: `parallel-${i}`,
        expectedRevision: synced.data.kitchen.revision,
        action: actions[i],
      }),
    ),
  );
  expect(results.map((r) => r.ok)).toEqual([true, true, true, true]);
  const final = await clients[0].emitWithAck("state:resync", {
    ...meta(0),
    roomCode: code,
  });
  if (!final.ok) throw Error("sync");
  expect(Object.keys(final.data.controlLeaseByPlayer)).toHaveLength(4);
  expect(
    Object.values(final.data.kitchen.playerCarry).filter(Boolean),
  ).toHaveLength(4);
});
it("runs four real Socket.IO clients through ownership, conflicts, malformed requests, and reconnect", async () => {
  server = createGameServer({ allowDebug: true });
  await new Promise<void>((resolve) =>
    server.http.listen(0, "127.0.0.1", resolve),
  );
  const address = server.http.address() as { port: number };
  const connect = async () => {
    const s: Socket<ServerToClientEvents, ClientToServerEvents> = io(
      `http://127.0.0.1:${address.port}`,
      { transports: ["websocket"], forceNew: true },
    );
    clients.push(s);
    await new Promise<void>((resolve) => s.on("connect", resolve));
    return s;
  };
  for (let i = 0; i < 4; i++) await connect();
  const meta = (i: number) => ({
    protocolVersion: 1 as const,
    requestId: crypto.randomUUID(),
    deviceId: `d${i}`,
  });
  const created = await clients[0].emitWithAck("room:create", {
    ...meta(0),
    debugMode: true,
  });
  expect(created.ok).toBe(true);
  if (!created.ok) throw Error("create");
  let room = created.data;
  for (let i = 1; i < 4; i++)
    expect(
      (
        await clients[i].emitWithAck("room:join", {
          ...meta(i),
          roomCode: room.code,
        })
      ).ok,
    ).toBe(true);
  for (let i = 0; i < 4; i++)
    expect(
      (
        await clients[i].emitWithAck("station:select", {
          ...meta(i),
          roomCode: room.code,
          stationId: STATIONS[i],
        })
      ).ok,
    ).toBe(true);
  const addPayload = {
    ...meta(0),
    roomCode: room.code,
    name: "Chef",
    color: "red" as const,
  };
  const added = await clients[0].emitWithAck("player:add", addPayload);
  if (!added.ok) throw Error("add");
  room = added.data;
  const repeated = await clients[0].emitWithAck("player:add", addPayload);
  expect(repeated.ok && repeated.data.players.length).toBe(1);
  expect(
    await clients[0].emitWithAck("player:add", {
      ...addPayload,
      name: "Changed",
    }),
  ).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
  const player = room.players[0].id;
  await clients[0].emitWithAck("game:start", {
    ...meta(0),
    roomCode: room.code,
  });
  await clients[0].emitWithAck("identity:presence", {
    ...meta(0),
    roomCode: room.code,
    playerId: player,
    confidence: null,
    evidence: "manual-debug",
  });
  const synced = await clients[0].emitWithAck("state:resync", {
    ...meta(0),
    roomCode: room.code,
  });
  if (!synced.ok) throw Error("sync");
  const payload = {
    ...meta(0),
    roomCode: room.code,
    stationId: STATIONS[0],
    actionId: "pick",
    expectedRevision: synced.data.kitchen.revision,
    action: { type: "PICKUP_STORAGE" as const, ingredient: "tomato" as const },
  };
  const picked = await clients[0].emitWithAck("kitchen:action", payload);
  expect(picked.ok).toBe(true);
  expect((await clients[0].emitWithAck("kitchen:action", payload)).ok).toBe(
    true,
  );
  await clients[1].emitWithAck("identity:presence", {
    ...meta(1),
    roomCode: room.code,
    playerId: player,
    confidence: null,
    evidence: "manual-debug",
  });
  const rejected = await clients[0].emitWithAck("kitchen:action", {
    ...payload,
    actionId: "new",
  });
  expect(rejected).toMatchObject({
    ok: false,
    error: { code: "CONTROL_LEASE_MOVED" },
  });
  const spoofed = await clients[2].emitWithAck("identity:presence", {
    ...meta(1),
    roomCode: room.code,
    playerId: player,
    confidence: null,
    evidence: "manual-debug",
  });
  expect(spoofed).toMatchObject({
    ok: false,
    error: { code: "NOT_AUTHORIZED" },
  });
  const broken = await (
    clients[2].emitWithAck as (
      event: string,
      payload: unknown,
    ) => Promise<unknown>
  )("player:add", null);
  expect(broken).toMatchObject({
    ok: false,
    error: { code: "INVALID_REQUEST" },
  });
  clients[1].disconnect();
  const fresh = await connect();
  const rejoined = await fresh.emitWithAck("room:join", {
    ...meta(1),
    roomCode: room.code,
  });
  expect(rejoined.ok).toBe(true);
  if (rejoined.ok)
    expect(rejoined.data.kitchen.playerCarry[player]).toBe(
      picked.ok ? picked.data.kitchen.playerCarry[player] : null,
    );
});
