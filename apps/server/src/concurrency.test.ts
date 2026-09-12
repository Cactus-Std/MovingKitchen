// @vitest-environment node
import { expect, it } from "vitest";
import { Rooms } from "./rooms.js";
import { type KitchenAction, type StationId } from "@kitchen/shared";

it("accepts simultaneous commands at different stations from one snapshot, including across a timer tick", () => {
  let now = 1000;
  const rooms = new Rooms(true, () => now);
  const room = rooms.create("a", "sa", true);
  rooms.join(room.code, "b", "sb");
  rooms.join(room.code, "c", "sc");
  rooms.join(room.code, "d", "sd");
  const stations: StationId[] = [
    "storage-sink",
    "board-1",
    "board-2",
    "oven-pass",
  ];
  stations.forEach((station, i) =>
    rooms.bind(rooms.get(room.code), ["a", "b", "c", "d"][i], station),
  );
  for (const [i, color] of (
    ["red", "blue", "green", "yellow"] as const
  ).entries())
    rooms.add(room.code, `Chef ${i}`, color);
  rooms.start(room.code, "a");
  room.players.forEach((p, i) =>
    rooms.presence(
      room.code,
      ["a", "b", "c", "d"][i],
      p.id,
      null,
      "manual-debug",
    ),
  );
  const revision = room.kitchen.revision;
  now += 500;
  rooms.tick();
  const actions: KitchenAction[] = [
    { type: "PICKUP_STORAGE", ingredient: "sausage" },
    { type: "PICKUP_ITEM", itemId: "board-1:knife" },
    { type: "PICKUP_ITEM", itemId: "board-2:knife" },
    { type: "PICKUP_ITEM", itemId: "oven-pass:oven-mitt" },
  ];
  actions.forEach((action, i) =>
    rooms.action({
      protocolVersion: 1,
      requestId: `r${i}`,
      actionId: `a${i}`,
      deviceId: ["a", "b", "c", "d"][i],
      roomCode: room.code,
      stationId: stations[i],
      expectedRevision: revision,
      action,
    }),
  );
  expect(room.players.every((p) => room.kitchen.playerCarry[p.id])).toBe(true);
  expect(Object.keys(room.controlLeaseByPlayer)).toHaveLength(4);
  now += 200;
  expect(() =>
    rooms.action({
      protocolVersion: 1,
      requestId: "stale",
      actionId: "stale",
      deviceId: "b",
      roomCode: room.code,
      stationId: "board-1",
      expectedRevision: revision,
      action: { type: "RETURN_TOOL" },
    }),
  ).toThrow("状态已更新");
});

it("lets both boards advance chopping from the same revision", () => {
  let now = 1000;
  const rooms = new Rooms(true, () => now),
    room = rooms.create("a", "a", true);
  rooms.join(room.code, "b", "b");
  const entry = rooms.get(room.code);
  rooms.bind(entry, "a", "storage-sink");
  rooms.bind(entry, "b", "board-2");
  rooms.add(room.code, "A", "red");
  rooms.add(room.code, "B", "blue");
  rooms.start(room.code, "a");
  room.players.forEach((p, i) =>
    rooms.presence(room.code, i ? "b" : "a", p.id, null, "manual-debug"),
  );
  const act = (
    deviceId: string,
    action: KitchenAction,
    revision = room.kitchen.revision,
  ) => {
    now += 200;
    rooms.action({
      protocolVersion: 1,
      requestId: String(now),
      actionId: String(now),
      deviceId,
      roomCode: room.code,
      stationId: room.stationByDevice[deviceId]!,
      expectedRevision: revision,
      action,
    });
  };
  for (const [device, station] of [
    ["a", "board-1"],
    ["b", "board-2"],
  ] as const) {
    rooms.bind(entry, device, "storage-sink");
    act(device, { type: "PICKUP_STORAGE", ingredient: "sausage" });
    rooms.bind(entry, device, station);
    act(device, { type: "PLACE_ITEM" });
    act(device, { type: "PICKUP_ITEM", itemId: station + ":knife" });
  }
  const revision = room.kitchen.revision;
  act("a", { type: "CHOP" }, revision);
  act("b", { type: "CHOP" }, revision);
  for (const station of ["board-1", "board-2"] as const)
    expect(
      room.kitchen.items[room.kitchen.stations[station].occupiedItemId!]
        .cutProgress,
    ).toBe(20);
});
