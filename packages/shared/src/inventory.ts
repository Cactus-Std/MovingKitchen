import type { KitchenState, Item } from "./types.js";

export function getCarriedItem(
  kitchen: KitchenState,
  playerId: string,
): Item | undefined {
  const item = kitchen.items[kitchen.playerCarry[playerId] ?? ""];
  return item?.location === "carried" && item.heldBy === playerId
    ? item
    : undefined;
}
