// @vitest-environment node
import { expect, it } from "vitest";
import { Rooms } from "./rooms.js";
import type { KitchenAction, KitchenActionPayload } from "@kitchen/shared";

function fixture() {
  let now = 1000;
  const rooms = new Rooms(true, () => now),
    room = rooms.create("one", "s1", true);
  rooms.join(room.code, "two", "s2");
  const entry = rooms.get(room.code);
  rooms.bind(entry, "one", "storage-sink");
  rooms.bind(entry, "two", "board-2");
  rooms.add(room.code, "Alice", "red");
  rooms.add(room.code, "Bob", "blue");
  rooms.start(room.code, "one");
  const [alice, bob] = room.players;
  rooms.presence(room.code, "one", alice.id, null, "manual-debug");
  rooms.presence(room.code, "two", bob.id, null, "manual-debug");
  const payload = (
    deviceId: string,
    action: KitchenAction,
  ): KitchenActionPayload => ({
    protocolVersion: 1,
    requestId: crypto.randomUUID(),
    actionId: crypto.randomUUID(),
    roomCode: room.code,
    deviceId,
    stationId: room.stationByDevice[deviceId]!,
    expectedRevision: room.kitchen.revision,
    controlToken:
      room.controlLeaseByPlayer[
        room.presenceByDevice[deviceId].lockedPlayerId!
      ]!.token,
    action,
  });
  rooms.action(
    payload("one", { type: "PICKUP_STORAGE", ingredient: "cheese" }),
  );
  rooms.bind(entry, "one", "board-1");
  rooms.bind(entry, "two", "storage-sink");
  rooms.action(payload("two", { type: "PICKUP_STORAGE", ingredient: "dough" }));
  rooms.bind(entry, "two", "board-2");
  now += 200;
  return {
    rooms,
    room,
    alice,
    bob,
    payload,
    advance: () => {
      now += 200;
    },
  };
}
it("rejects an old player intent after the same computer switches to another player", () => {
  const { rooms, room, alice, bob, payload } = fixture();
  const delayed = payload("one", { type: "DISCARD" });
  const before = structuredClone(room.kitchen);
  rooms.presence(room.code, "one", bob.id, null, "manual-debug");
  expect(() => rooms.action(delayed)).toThrow("控制身份已变化");
  expect(room.kitchen).toEqual(before);
  expect(room.kitchen.items[room.kitchen.playerCarry[alice.id]!].heldBy).toBe(
    alice.id,
  );
  expect(room.kitchen.items[room.kitchen.playerCarry[bob.id]!].heldBy).toBe(
    bob.id,
  );
});
it("keeps each inventory when a player leaves and returns, rotating the control token", () => {
  const { rooms, room, alice, payload } = fixture();
  const old = payload("one", { type: "DISCARD" }),
    itemId = room.kitchen.playerCarry[alice.id];
  rooms.presence(room.code, "one", alice.id, null, "manual-debug");
  expect(room.controlLeaseByPlayer[alice.id]!.token).toBe(old.controlToken);
  rooms.presence(room.code, "one", null, null, "cleared");
  expect(room.kitchen.playerCarry[alice.id]).toBe(itemId);
  rooms.presence(room.code, "one", alice.id, null, "manual-debug");
  expect(room.controlLeaseByPlayer[alice.id]!.token).not.toBe(old.controlToken);
  expect(() => rooms.action(old)).toThrow("控制身份已变化");
  expect(room.kitchen.items[itemId!].heldBy).toBe(alice.id);
});
it("cannot pick up an item already held by a different player", () => {
  const { rooms, room, alice, payload, advance } = fixture();
  rooms.action(payload("two", { type: "DISCARD" }));
  advance();
  const before = structuredClone(room.kitchen);
  expect(() =>
    rooms.action(
      payload("two", {
        type: "PICKUP_ITEM",
        itemId: room.kitchen.playerCarry[alice.id]!,
      }),
    ),
  ).toThrow();
  expect(room.kitchen).toEqual(before);
});
it("replays a completed old-player action without mutating the new player inventory", () => {
  const { rooms, room, bob, payload } = fixture();
  const completed = payload("one", { type: "DISCARD" });
  rooms.action(completed);
  rooms.presence(room.code, "one", bob.id, null, "manual-debug");
  const before = structuredClone(room.kitchen);
  rooms.action(completed);
  expect(room.kitchen).toEqual(before);
  expect(room.kitchen.items[room.kitchen.playerCarry[bob.id]!].heldBy).toBe(
    bob.id,
  );
});
it("rejects stale heartbeats without removing the newly selected player control", () => {
  const { rooms, room, alice, bob } = fixture();
  // Enrolled identities also cannot use an old heartbeat to replace a new identity.
  alice.enrolled = true;
  bob.enrolled = true;
  rooms.presence(room.code, "one", bob.id, 0.9, "positive-match");
  const token = room.controlLeaseByPlayer[bob.id]!.token;
  expect(() =>
    rooms.presence(room.code, "one", alice.id, null, "lock-heartbeat"),
  ).toThrow("控制身份");
  expect(room.presenceByDevice.one.lockedPlayerId).toBe(bob.id);
  expect(room.controlLeaseByPlayer[bob.id]!.token).toBe(token);
});
