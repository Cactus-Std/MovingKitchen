// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  FACE_MODEL,
  PRESENCE_TTL,
  type KitchenActionPayload,
} from "@kitchen/shared";
import { Rooms } from "./rooms.js";
function rig() {
  let now = 1000;
  const rooms = new Rooms(true, () => now);
  const room = rooms.create("one", "s1", true);
  rooms.join(room.code, "two", "s2");
  rooms.bind(rooms.get(room.code), "one", "storage-sink");
  rooms.bind(rooms.get(room.code), "two", "board-1");
  rooms.add(room.code, "Alice", "red");
  const player = room.players[0].id;
  rooms.start(room.code, "one");
  rooms.presence(room.code, "one", player, null, "manual-debug");
  const action = (id = "a"): KitchenActionPayload => ({
    protocolVersion: 1,
    requestId: id,
    roomCode: room.code,
    deviceId: "one",
    stationId: "storage-sink",
    expectedRevision: room.kitchen.revision,
    actionId: id,
    action: { type: "PICKUP_STORAGE", ingredient: "tomato" },
  });
  return {
    rooms,
    room,
    player,
    action,
    advance: (n = 200) => {
      now += n;
    },
  };
}
describe("identity ownership and recovery", () => {
  it("moves carrying ownership to another screen; old heartbeats cannot reclaim it", () => {
    const { rooms, room, player, action } = rig();
    rooms.action(action());
    const item = room.kitchen.playerCarry[player];
    rooms.presence(room.code, "two", player, null, "manual-debug");
    rooms.presence(room.code, "one", player, null, "lock-heartbeat");
    expect(room.controlLeaseByPlayer[player]?.deviceId).toBe("two");
    expect(room.kitchen.playerCarry[player]).toBe(item);
    expect(() => rooms.action(action("b"))).toThrow("另一台电脑");
  });
  it("is idempotent and rejects reuse with a different action", () => {
    const { rooms, room, action } = rig();
    const payload = action();
    rooms.action(payload);
    const revision = room.kitchen.revision;
    rooms.action(payload);
    expect(room.kitchen.revision).toBe(revision);
    expect(
      Object.values(room.kitchen.items).filter((i) => i.kind === "tomato"),
    ).toHaveLength(1);
    expect(() =>
      rooms.action({ ...payload, action: { type: "TOGGLE_FAUCET" } }),
    ).toThrow("不同操作");
  });
  it("rejects stale presence, mismatched stations, and stale revisions", () => {
    const { rooms, room, action, advance } = rig();
    expect(() => rooms.action({ ...action(), stationId: "board-1" })).toThrow(
      "工位",
    );
    expect(() => rooms.action({ ...action(), expectedRevision: 0 })).toThrow(
      "状态已更新",
    );
    advance(PRESENCE_TTL + 1);
    expect(() => rooms.action(action())).toThrow("身份已过期");
    rooms.tick();
    expect(Object.keys(room.controlLeaseByPlayer)).toHaveLength(0);
  });
  it("retains presence until the last tab disconnects and preserves item on reconnect", () => {
    const { rooms, room, player, action } = rig();
    rooms.join(room.code, "one", "s1b");
    rooms.action(action());
    rooms.leave(room.code, "one", "s1");
    expect(room.controlLeaseByPlayer[player]).toBeDefined();
    rooms.leave(room.code, "one", "s1b");
    expect(room.controlLeaseByPlayer[player]).toBeUndefined();
    rooms.join(room.code, "one", "new");
    expect(room.stationByDevice.one).toBe("storage-sink");
    expect(room.kitchen.playerCarry[player]).not.toBeNull();
  });
  it("validates enrollment metadata and never includes embeddings in room state", () => {
    const rooms = new Rooms(true);
    const room = rooms.create("one", "s", true);
    rooms.add(room.code, "Alice", "red");
    const player = room.players[0].id;
    const template = {
      ...FACE_MODEL,
      vector: Array.from({ length: 512 }, (_, i) => (i === 0 ? 1 : 0)),
    };
    rooms.enroll(room.code, player, template);
    expect(JSON.stringify(room)).not.toContain("vector");
    expect(rooms.get(room.code).roster).toHaveLength(1);
    expect(() =>
      rooms.enroll(room.code, player, { ...template, vector: [NaN] }),
    ).toThrow("512");
    expect(() =>
      rooms.enroll(room.code, player, { ...template, modelVersion: "wrong" }),
    ).toThrow("版本");
  });
  it("reserves one laptop per station and requires a fully enrolled real room", () => {
    const rooms = new Rooms();
    expect(() => rooms.create("d", "s", true)).toThrow();
    const room = rooms.create("d", "s", false);
    rooms.join(room.code, "other", "s2");
    rooms.bind(rooms.get(room.code), "d", "storage-sink");
    expect(() =>
      rooms.bind(rooms.get(room.code), "other", "storage-sink"),
    ).toThrow("已经");
    rooms.add(room.code, "A", "red");
    expect(() => rooms.start(room.code, "d")).toThrow("四位");
  });
  it("joins before station selection and requires assignment before starting", () => {
    const rooms = new Rooms(true);
    const room = rooms.create("a", "s", true);
    rooms.join(room.code, "b", "t");
    expect(room.connectedDeviceIds).toEqual(["a", "b"]);
    expect(room.stationByDevice).toEqual({});
    rooms.add(room.code, "Chef", "red");
    expect(() => rooms.start(room.code, "a")).toThrow("分配工位");
    rooms.bind(rooms.get(room.code), "a", "storage-sink");
    rooms.bind(rooms.get(room.code), "b", "board-1");
    rooms.start(room.code, "a");
    expect(room.kitchen.status).toBe("playing");
  });
  it("keeps one player per device without releasing other devices controls", () => {
    const other = new Rooms(true);
    const r = other.create("a", "a", true);
    other.join(r.code, "b", "b");
    other.add(r.code, "A", "red");
    other.add(r.code, "B", "blue");
    other.add(r.code, "C", "green");
    other.presence(r.code, "a", r.players[0].id, null, "manual-debug");
    other.presence(r.code, "b", r.players[1].id, null, "manual-debug");
    expect(Object.keys(r.controlLeaseByPlayer)).toHaveLength(2);
    other.presence(r.code, "a", r.players[2].id, null, "manual-debug");
    expect(r.controlLeaseByPlayer[r.players[0].id]).toBeUndefined();
    expect(r.controlLeaseByPlayer[r.players[1].id]?.deviceId).toBe("b");
    expect(r.controlLeaseByPlayer[r.players[2].id]?.deviceId).toBe("a");
  });
});
