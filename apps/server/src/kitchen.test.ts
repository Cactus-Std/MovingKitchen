// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  BAKE_MS,
  BURN_MS,
  GAME_MS,
  type KitchenAction,
  type StationId,
} from "@kitchen/shared";
import { newKitchen, applyKitchenAction, advanceKitchen } from "./kitchen.js";
function rig() {
  const state = newKitchen([
    { id: "chef", name: "Chef", color: "red", enrolled: false },
  ]);
  state.status = "playing";
  state.startedAt = 0;
  const act = (station: StationId, action: KitchenAction) =>
    applyKitchenAction(state, "chef", station, action, 0);
  const held = () => state.items[state.playerCarry.chef!];
  return { state, act, held };
}
function prepared() {
  const r = rig();
  for (const ingredient of ["tomato", "sausage", "cheese", "dough"] as const) {
    r.act("storage-sink", { type: "PICKUP_STORAGE", ingredient });
    if (ingredient === "dough") r.act("storage-sink", { type: "STRETCH" });
    if (ingredient === "tomato") {
      r.act("storage-sink", { type: "PLACE_ITEM" });
      r.act("storage-sink", { type: "TOGGLE_FAUCET" });
      const id = r.state.stations["storage-sink"].occupiedItemId!;
      for (let i = 0; i < 48; i += 8)
        r.act("storage-sink", {
          type: "WASH",
          itemId: id,
          patches: Array.from({ length: 8 }, (_, n) => i + n),
        });
      r.act("storage-sink", { type: "TOGGLE_FAUCET" });
      r.act("storage-sink", { type: "PICKUP_ITEM", itemId: id });
    }
    if (ingredient === "tomato" || ingredient === "sausage") {
      const id = r.held().id;
      r.act("board-1", { type: "PLACE_ITEM" });
      r.act("board-1", { type: "PICKUP_ITEM", itemId: "board-1:knife" });
      for (let i = 0; i < 5; i++) r.act("board-1", { type: "CHOP" });
      r.act("board-1", { type: "RETURN_TOOL" });
      r.act("board-1", { type: "PICKUP_ITEM", itemId: id });
    }
    r.act("oven-pass", { type: "ADD_TO_OVEN" });
  }
  return r;
}
describe("authoritative kitchen", () => {
  it("completes the actual Pizza recipe, mitt retrieval, slicing, and scoring", () => {
    const { state, act } = prepared();
    expect(state.oven.status).toBe("baking");
    advanceKitchen(state, BAKE_MS, BAKE_MS);
    act("oven-pass", { type: "PICKUP_ITEM", itemId: "oven-pass:oven-mitt" });
    act("oven-pass", { type: "TAKE_PIZZA" });
    expect(state.playerCarry.chef).toBe("oven-pass:oven-mitt");
    act("oven-pass", { type: "RETURN_TOOL" });
    act("oven-pass", { type: "PICKUP_ITEM", itemId: "oven-pass:pizza-cutter" });
    act("oven-pass", { type: "SLICE_PIZZA" });
    expect(state.status).toBe("finished");
    expect(state.finishedReason).toBe("served");
    expect(state.score).toBeGreaterThan(1000);
  });
  it("rejects raw dough, dirty tomato, duplicate food, and tool disposal without mutation", () => {
    const { state, act } = rig();
    act("storage-sink", { type: "PICKUP_STORAGE", ingredient: "dough" });
    const before = structuredClone(state);
    expect(() => act("oven-pass", { type: "ADD_TO_OVEN" })).toThrow();
    expect(state).toEqual(before);
    act("storage-sink", { type: "STRETCH" });
    act("oven-pass", { type: "ADD_TO_OVEN" });
    act("storage-sink", { type: "PICKUP_STORAGE", ingredient: "dough" });
    act("storage-sink", { type: "STRETCH" });
    expect(() => act("oven-pass", { type: "ADD_TO_OVEN" })).toThrow();
    act("board-1", { type: "DISCARD" });
    act("storage-sink", { type: "PICKUP_STORAGE", ingredient: "tomato" });
    expect(() => act("board-1", { type: "PLACE_ITEM" })).toThrow();
    act("board-1", { type: "DISCARD" });
    act("board-1", { type: "PICKUP_ITEM", itemId: "board-1:knife" });
    expect(() => act("board-1", { type: "DISCARD" })).toThrow();
    expect(state.waste).toMatchObject({ total: 2, dough: 1, tomato: 1 });
  });
  it("enforces one item, independent boards, and tool home station", () => {
    const { state, act, held } = rig();
    act("storage-sink", { type: "PICKUP_STORAGE", ingredient: "sausage" });
    const id = held().id;
    expect(() =>
      act("storage-sink", { type: "PICKUP_STORAGE", ingredient: "cheese" }),
    ).toThrow();
    act("board-1", { type: "PLACE_ITEM" });
    expect(state.stations["board-2"].occupiedItemId).toBeNull();
    expect(() => act("board-2", { type: "PICKUP_ITEM", itemId: id })).toThrow();
    act("board-1", { type: "PICKUP_ITEM", itemId: "board-1:knife" });
    expect(() => act("board-2", { type: "RETURN_TOOL" })).toThrow();
  });
  it("shares finite water, validates patch progress, and stops at timeout", () => {
    const { state, act } = rig();
    act("storage-sink", { type: "PICKUP_STORAGE", ingredient: "tomato" });
    act("storage-sink", { type: "PLACE_ITEM" });
    const id = state.stations["storage-sink"].occupiedItemId!;
    expect(() =>
      act("storage-sink", { type: "WASH", itemId: id, patches: [0] }),
    ).toThrow();
    act("storage-sink", { type: "TOGGLE_FAUCET" });
    act("storage-sink", { type: "WASH", itemId: id, patches: [0, 0, 1] });
    expect(state.items[id].cleanliness).toBe(4);
    expect(() =>
      act("storage-sink", { type: "WASH", itemId: id, patches: [48] }),
    ).toThrow();
    advanceKitchen(state, 200_000, 200_000);
    expect(state.waterRemaining).toBe(0);
    expect(state.faucetOn).toBe(false);
    advanceKitchen(state, GAME_MS, 100_000);
    expect(state.finishedReason).toBe("timeout");
  });
  it("burns pizza if nobody retrieves it in time and prevents early retrieval", () => {
    const { state, act } = prepared();
    act("oven-pass", { type: "PICKUP_ITEM", itemId: "oven-pass:oven-mitt" });
    expect(() => act("oven-pass", { type: "TAKE_PIZZA" })).toThrow();
    advanceKitchen(state, BURN_MS, BURN_MS);
    expect(state.finishedReason).toBe("burnt");
    expect(state.score).toBe(0);
  });
  it("applies cross-contamination and lets cloth clean an empty board", () => {
    const { state, act } = prepared();
    expect(state.stations["board-1"].contaminationCount).toBe(1);
    act("board-1", { type: "PICKUP_ITEM", itemId: "board-1:cloth" });
    act("board-1", { type: "WIPE" });
    expect(state.stations["board-1"].dirty).toBe(false);
  });
});
