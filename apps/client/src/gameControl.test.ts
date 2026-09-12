import { beforeEach, expect, it, vi } from "vitest";
import { Rooms } from "../../server/src/rooms";
import { applyKitchenAction } from "../../server/src/kitchen";
import { getGameControl } from "./gameControl";
import type { RoomState } from "@kitchen/shared";

const fake = vi.hoisted(() => {
  const handlers = new Map<string, (data: RoomState) => void>();
  const socket = {
    connected: true,
    on: vi.fn((name: string, handler: (data: RoomState) => void) => {
      handlers.set(name, handler);
    }),
    timeout: () => socket,
    emitWithAck: vi.fn(),
  };
  return { handlers, socket };
});
vi.mock("socket.io-client", () => ({ io: () => fake.socket }));

function fixture(device = "d1") {
  const rooms = new Rooms(true),
    room = rooms.create(device, "s1", true);
  rooms.join(room.code, "d2", "s2");
  const entry = rooms.get(room.code);
  rooms.bind(entry, device, "storage-sink");
  rooms.bind(entry, "d2", "board-1");
  rooms.add(room.code, "Alice", "red");
  rooms.add(room.code, "Bob", "blue");
  rooms.start(room.code, device);
  const [alice, bob] = room.players;
  rooms.presence(room.code, device, alice.id, null, "manual-debug");
  rooms.presence(room.code, "d2", bob.id, null, "manual-debug");
  applyKitchenAction(
    room.kitchen,
    alice.id,
    "storage-sink",
    { type: "PICKUP_STORAGE", ingredient: "cheese" },
    Date.now(),
  );
  applyKitchenAction(
    room.kitchen,
    bob.id,
    "storage-sink",
    { type: "PICKUP_STORAGE", ingredient: "dough" },
    Date.now(),
  );
  rooms.bind(entry, device, "board-2");
  return { rooms, room, alice, bob };
}
beforeEach(() => {
  vi.resetModules();
  fake.handlers.clear();
  fake.socket.emitWithAck.mockReset();
  sessionStorage.clear();
});

it("shows only the confirmed player inventory across a two-player station swap", () => {
  const { rooms, room, alice, bob } = fixture();
  const aItem = room.kitchen.playerCarry[alice.id],
    bItem = room.kitchen.playerCarry[bob.id];
  expect(getGameControl(room, "d1", alice.id)?.held?.id).toBe(aItem);
  expect(getGameControl(room, "d1", bob.id)).toBeNull();
  rooms.presence(room.code, "d1", bob.id, null, "manual-debug");
  expect(getGameControl(room, "d1", alice.id)).toBeNull();
  expect(getGameControl(room, "d1", bob.id)?.held?.id).toBe(bItem);
  expect(getGameControl(room, "d2", bob.id)).toBeNull();
  rooms.presence(room.code, "d2", alice.id, null, "manual-debug");
  expect(getGameControl(room, "d2", alice.id)?.held?.id).toBe(aItem);
  expect(getGameControl(room, "d1", bob.id)?.held?.id).toBe(bItem);
  expect(aItem).not.toBe(bItem);
});
it("does not show or act on an item whose owner disagrees with the carry slot", () => {
  const { room, alice, bob } = fixture();
  room.kitchen.playerCarry[alice.id] = room.kitchen.playerCarry[bob.id];
  expect(getGameControl(room, "d1", alice.id)).toBeNull();
  expect(() =>
    applyKitchenAction(
      room.kitchen,
      alice.id,
      "board-2",
      { type: "DISCARD" },
      Date.now(),
    ),
  ).toThrow("携带物与玩家身份不一致");
  expect(room.kitchen.items[room.kitchen.playerCarry[bob.id]!].heldBy).toBe(
    bob.id,
  );
});
it("never falls back to the first room player when recognition is absent", () => {
  const { room } = fixture();
  expect(getGameControl(room, "d1", null)).toBeNull();
  expect(getGameControl(room, "d1", "unknown")).toBeNull();
});
it("pins the control token and visible revision when transmitting an action", async () => {
  const network = await import("./network");
  const { room, alice } = fixture(network.deviceId);
  fake.socket.emitWithAck.mockResolvedValue({ ok: true, data: room });
  await network.joinRoom(room.code);
  const context = getGameControl(room, network.deviceId, alice.id)!.context;
  const next = structuredClone(room);
  next.kitchen.revision += 5;
  fake.handlers.get("room:state")!(next);
  fake.socket.emitWithAck.mockClear();
  await network.kitchenAction({ type: "DISCARD" }, context, "intent");
  const payload = fake.socket.emitWithAck.mock.calls[0][1];
  expect(payload.expectedRevision).toBe(context.expectedRevision);
  expect(payload.controlToken).toBe(context.controlToken);
  expect(payload).not.toHaveProperty("playerId");
});
it("does not relabel a delayed old-player action with the new player token", async () => {
  const network = await import("./network");
  const { rooms, room, alice, bob } = fixture(network.deviceId);
  fake.socket.emitWithAck.mockResolvedValue({
    ok: true,
    data: structuredClone(room),
  });
  await network.joinRoom(room.code);
  const context = getGameControl(room, network.deviceId, alice.id)!.context;
  rooms.presence(room.code, network.deviceId, bob.id, null, "manual-debug");
  fake.handlers.get("room:state")!(structuredClone(room));
  fake.socket.emitWithAck.mockClear();
  await expect(
    network.kitchenAction({ type: "DISCARD" }, context, "old-intent"),
  ).rejects.toThrow("控制身份或工位已变化");
  expect(fake.socket.emitWithAck).not.toHaveBeenCalled();
});
