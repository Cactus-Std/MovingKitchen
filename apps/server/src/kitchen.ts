import { randomUUID } from "node:crypto";
import {
  BAKE_MS,
  BURN_MS,
  GAME_MS,
  FOODS,
  STATIONS,
  getCarriedItem,
  type IngredientKind,
  type Item,
  type KitchenAction,
  type KitchenState,
  type Player,
  type StationId,
  type ToolKind,
} from "@kitchen/shared";
import { requireRule as check } from "./errors.js";

export function newKitchen(players: Player[] = []): KitchenState {
  const state: KitchenState = {
    revision: 0,
    status: "lobby",
    remainingMs: GAME_MS,
    startedAt: null,
    finishedReason: null,
    playerCarry: Object.fromEntries(players.map((p) => [p.id, null])),
    items: {},
    stations: Object.fromEntries(
      STATIONS.map((s) => [
        s,
        {
          occupiedItemId: null,
          dirty: false,
          lastIngredient: null,
          contaminationCount: 0,
        },
      ]),
    ) as KitchenState["stations"],
    waterRemaining: 100,
    faucetOn: false,
    oven: {
      ingredientItemIds: {},
      pizzaItemId: null,
      status: "idle",
      startedAt: null,
      cookProgress: 0,
    },
    waste: { total: 0, tomato: 0, sausage: 0, cheese: 0, dough: 0 },
    score: 0,
  };
  for (const station of STATIONS) {
    const tools: ToolKind[] = station.startsWith("board")
      ? ["knife", "cloth", "whisk"]
      : station === "oven-pass"
        ? ["oven-mitt", "pizza-cutter"]
        : [];
    for (const kind of tools) {
      const id = `${station}:${kind}`;
      state.items[id] = {
        ...newItem(kind),
        id,
        location: "home",
        homeStation: station,
      };
    }
  }
  return state;
}
function newItem(kind: Item["kind"]): Item {
  return {
    id: randomUUID(),
    kind,
    location: "carried",
    heldBy: null,
    processState: kind === "tomato" ? "dirty" : "raw",
    cleanliness: kind === "tomato" ? 0 : 100,
    cutProgress: 0,
    hygiene: 100,
    stretched: false,
    washedPatches: [],
  };
}
export const isFood = (item: Item): boolean =>
  FOODS.includes(item.kind as IngredientKind);
function carry(state: KitchenState, playerId: string, item: Item) {
  item.location = "carried";
  item.heldBy = playerId;
  state.playerCarry[playerId] = item.id;
}
function release(
  state: KitchenState,
  playerId: string,
  item: Item,
  location: Item["location"],
) {
  state.playerCarry[playerId] = null;
  item.heldBy = null;
  item.location = location;
}
export function advanceKitchen(
  state: KitchenState,
  now: number,
  elapsed: number,
): boolean {
  if (state.status !== "playing") return false;
  state.remainingMs = Math.max(0, GAME_MS - (now - state.startedAt!));
  if (state.faucetOn) {
    state.waterRemaining = Math.max(
      0,
      state.waterRemaining - (elapsed / 1000) * 0.5,
    );
    if (!state.waterRemaining) state.faucetOn = false;
  }
  if (
    state.oven.startedAt !== null &&
    ["baking", "ready"].includes(state.oven.status)
  ) {
    const duration = now - state.oven.startedAt;
    state.oven.cookProgress = Math.min(100, (duration / BAKE_MS) * 100);
    state.oven.status =
      duration >= BURN_MS ? "burnt" : duration >= BAKE_MS ? "ready" : "baking";
    if (state.oven.status === "burnt") finish(state, "burnt");
  }
  if (!state.remainingMs) finish(state, "timeout");
  state.revision++;
  return true;
}
function finish(state: KitchenState, reason: KitchenState["finishedReason"]) {
  state.status = "finished";
  state.finishedReason = reason;
  state.faucetOn = false;
  const ingredients = Object.values(state.oven.ingredientItemIds).map(
    (id) => state.items[id],
  );
  const hygiene = ingredients.length
    ? ingredients.reduce((n, item) => n + item.hygiene, 0) / ingredients.length
    : 0;
  state.score =
    reason === "served"
      ? Math.max(
          0,
          Math.round(
            1000 +
              (state.remainingMs / 1000) * 2 +
              state.waterRemaining * 3 +
              hygiene * 2 -
              state.waste.total * 80,
          ),
        )
      : 0;
}
export function applyKitchenAction(
  state: KitchenState,
  playerId: string,
  station: StationId,
  action: KitchenAction,
  now: number,
): void {
  check(
    state.status === "playing",
    "INVALID_REQUEST",
    "本轮尚未开始或已经结束。",
  );
  const held = getCarriedItem(state, playerId);
  check(
    !state.playerCarry[playerId] || held,
    "INVALID_ITEM_STATE",
    "携带物与玩家身份不一致，请重新同步。",
  );
  const area = state.stations[station];
  const board = station === "board-1" || station === "board-2";
  const stationIs = (expected: StationId) =>
    check(station === expected, "INVALID_STATION", "请到对应工位操作。");
  const empty = () => check(!held, "HANDS_FULL", "先放下手中的物品。");
  const tool = (kind: ToolKind) =>
    check(held?.kind === kind, "INVALID_ITEM_STATE", "请先拿起对应工具。");
  switch (action.type) {
    case "PICKUP_STORAGE": {
      stationIs("storage-sink");
      empty();
      check(FOODS.includes(action.ingredient), "INVALID_REQUEST", "未知食材。");
      const item = newItem(action.ingredient);
      state.items[item.id] = item;
      carry(state, playerId, item);
      break;
    }
    case "PICKUP_ITEM": {
      empty();
      const item = state.items[action.itemId];
      check(item, "ITEM_NOT_AVAILABLE", "物品已不在这里。");
      const available =
        item.location === "home"
          ? item.homeStation === station
          : area.occupiedItemId === item.id;
      check(
        available && !item.heldBy,
        "ITEM_NOT_AVAILABLE",
        "物品已被拿走或不在当前工位。",
      );
      if (area.occupiedItemId === item.id) area.occupiedItemId = null;
      carry(state, playerId, item);
      break;
    }
    case "PLACE_ITEM": {
      check(held && isFood(held), "INVALID_ITEM_STATE", "只能在这里放置食材。");
      check(!area.occupiedItemId, "ITEM_NOT_AVAILABLE", "这里已经有食材了。");
      if (station === "storage-sink")
        check(
          held.kind === "tomato",
          "INVALID_ITEM_STATE",
          "只有番茄需要清洗。",
        );
      else {
        check(board, "INVALID_STATION", "请把食材直接放进烤箱。");
        check(
          held.kind === "tomato" || held.kind === "sausage",
          "INVALID_ITEM_STATE",
          "这里只有番茄和香肠需要切。",
        );
        check(
          held.kind !== "tomato" || held.cleanliness >= 92,
          "INVALID_ITEM_STATE",
          "番茄需要先洗净。",
        );
      }
      if (board && area.dirty && area.lastIngredient !== held.kind) {
        held.hygiene = Math.max(0, held.hygiene - 25);
        area.contaminationCount++;
      }
      area.occupiedItemId = held.id;
      release(
        state,
        playerId,
        held,
        board ? (station as "board-1" | "board-2") : "sink",
      );
      break;
    }
    case "RETURN_TOOL":
      check(held?.homeStation, "INVALID_ITEM_STATE", "手中没有可归还的工具。");
      check(
        held.homeStation === station,
        "INVALID_STATION",
        "工具需放回原工位。",
      );
      release(state, playerId, held, "home");
      break;
    case "TOGGLE_FAUCET":
      stationIs("storage-sink");
      empty();
      check(state.waterRemaining > 0, "INVALID_ITEM_STATE", "水已经用完了。");
      state.faucetOn = !state.faucetOn;
      break;
    case "WASH": {
      stationIs("storage-sink");
      empty();
      const item = state.items[action.itemId];
      check(
        item && area.occupiedItemId === item.id && item.kind === "tomato",
        "ITEM_NOT_AVAILABLE",
        "先把番茄放进水池。",
      );
      check(
        state.faucetOn && state.waterRemaining > 0,
        "INVALID_ITEM_STATE",
        "请先打开水龙头。",
      );
      check(
        Array.isArray(action.patches) &&
          action.patches.length > 0 &&
          action.patches.length <= 8 &&
          action.patches.every((p) => Number.isInteger(p) && p >= 0 && p < 48),
        "INVALID_REQUEST",
        "清洗区域无效。",
      );
      item.washedPatches = [
        ...new Set([...item.washedPatches, ...action.patches]),
      ];
      item.cleanliness = Math.round((item.washedPatches.length / 48) * 100);
      if (item.cleanliness >= 92) item.processState = "clean";
      break;
    }
    case "CHOP": {
      check(board, "INVALID_STATION", "请在菜板切菜。");
      tool("knife");
      const item = state.items[area.occupiedItemId ?? ""];
      check(
        item &&
          (item.kind === "sausage" ||
            (item.kind === "tomato" && item.cleanliness >= 92)),
        "INVALID_ITEM_STATE",
        "请放入可以切的食材。",
      );
      check(
        item.cutProgress < 100,
        "INVALID_ITEM_STATE",
        "已经切好了，请归还菜刀。",
      );
      item.cutProgress = Math.min(100, item.cutProgress + 20);
      if (item.cutProgress === 100) {
        item.processState = "chopped";
        area.dirty = true;
        area.lastIngredient = item.kind as IngredientKind;
      }
      break;
    }
    case "WIPE":
      check(board, "INVALID_STATION", "请在菜板擦拭。");
      tool("cloth");
      check(!area.occupiedItemId, "ITEM_NOT_AVAILABLE", "先拿走菜板上的食材。");
      area.dirty = false;
      area.lastIngredient = null;
      break;
    case "STRETCH":
      check(
        held?.kind === "dough" && !held.stretched,
        "INVALID_ITEM_STATE",
        "请拿起尚未展开的面饼。",
      );
      held.stretched = true;
      break;
    case "DISCARD":
      check(board, "INVALID_STATION", "垃圾桶在菜板工位。");
      check(held && isFood(held), "INVALID_ITEM_STATE", "只能丢弃食材。");
      state.waste.total++;
      state.waste[held.kind as IngredientKind]++;
      state.playerCarry[playerId] = null;
      delete state.items[held.id];
      break;
    case "ADD_TO_OVEN": {
      stationIs("oven-pass");
      check(held && isFood(held), "INVALID_ITEM_STATE", "手中没有食材。");
      const kind = held.kind as IngredientKind;
      check(
        state.oven.status === "idle" && !state.oven.ingredientItemIds[kind],
        "INVALID_ITEM_STATE",
        "这份食材已经加入了。",
      );
      check(
        (kind !== "tomato" ||
          (held.cleanliness >= 92 && held.cutProgress === 100)) &&
          (kind !== "sausage" || held.cutProgress === 100) &&
          (kind !== "dough" || held.stretched),
        "INVALID_ITEM_STATE",
        "番茄需洗净切碎，香肠需切碎，面饼需双手展开。",
      );
      release(state, playerId, held, "oven");
      state.oven.ingredientItemIds[kind] = held.id;
      if (FOODS.every((k) => state.oven.ingredientItemIds[k])) {
        state.oven.status = "baking";
        state.oven.startedAt = now;
      }
      break;
    }
    case "TAKE_PIZZA": {
      stationIs("oven-pass");
      tool("oven-mitt");
      check(
        state.oven.status === "ready" && !area.occupiedItemId,
        "INVALID_ITEM_STATE",
        "等 Pizza 烤好后再取出。",
      );
      const pizza = newItem("pizza");
      pizza.location = "pass";
      pizza.processState = "cooked";
      state.items[pizza.id] = pizza;
      area.occupiedItemId = pizza.id;
      state.oven.pizzaItemId = pizza.id;
      state.oven.status = "served";
      break;
    }
    case "SLICE_PIZZA":
      stationIs("oven-pass");
      tool("pizza-cutter");
      check(
        state.items[area.occupiedItemId ?? ""]?.kind === "pizza",
        "INVALID_ITEM_STATE",
        "先用隔热手套将 Pizza 取到托盘。",
      );
      finish(state, "served");
      break;
    default:
      check(false, "INVALID_REQUEST", "未知厨房动作。");
  }
  state.revision++;
}
