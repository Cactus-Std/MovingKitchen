import { expect, it } from "vitest";
import { newKitchen, applyKitchenAction } from "../../server/src/kitchen";
import { intentAction, type Target } from "./gameView";
import type { KitchenIntent } from "./input/contracts";

it("rejects an action for a replaced ingredient or a different held tool", () => {
  const kitchen = newKitchen([
    { id: "a", name: "A", color: "red", enrolled: false },
  ]);
  kitchen.status = "playing";
  applyKitchenAction(
    kitchen,
    "a",
    "storage-sink",
    { type: "PICKUP_STORAGE", ingredient: "sausage" },
    0,
  );
  applyKitchenAction(kitchen, "a", "board-1", { type: "PLACE_ITEM" }, 0);
  applyKitchenAction(
    kitchen,
    "a",
    "board-1",
    { type: "PICKUP_ITEM", itemId: "board-1:knife" },
    0,
  );
  const held = kitchen.items[kitchen.playerCarry.a!],
    item = kitchen.items[kitchen.stations["board-1"].occupiedItemId!];
  const target: Target = {
    input: {
      id: "work",
      label: "cut",
      kind: "place",
      bounds: { x: 0, y: 0, width: 1, height: 1 },
      allowed: false,
    },
    action: { type: "PLACE_ITEM" },
    visual: "board",
    item,
  };
  const intent: KitchenIntent = {
    inputVersion: "0.2",
    intentId: "i",
    contextId: "room:control",
    playerId: "a",
    sceneId: "board-1",
    source: "debug",
    detectedAt: 0,
    type: "action",
    itemId: item.id,
    heldItemId: held.id,
    action: "CHOP",
    metrics: null,
  };
  expect(intentAction(intent, [target], held)).toEqual({ type: "CHOP" });
  expect(
    intentAction({ ...intent, itemId: "old-food" }, [target], held),
  ).toBeNull();
  expect(
    intentAction({ ...intent, heldItemId: "old-tool" }, [target], held),
  ).toBeNull();
});
