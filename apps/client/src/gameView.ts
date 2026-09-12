import {
  FOODS,
  type Item,
  type KitchenAction,
  type RoomState,
  type StationId,
} from "@kitchen/shared";
import type {
  ActionTarget,
  HeldItem,
  InteractionTarget,
  KitchenIntent,
  Rect,
} from "./input/contracts";
import { DEFAULT_LANGUAGE, text, type Language } from "./i18n";

export function getStationLabels(
  language: Language,
): Record<StationId, string> {
  return {
    "storage-sink": text(language, "Storage & sink", "储物与水池"),
    "board-1": text(language, "Cutting board 1", "1 号菜板"),
    "board-2": text(language, "Cutting board 2", "2 号菜板"),
    "oven-pass": text(language, "Oven & pass", "烤箱与出餐"),
  };
}

export function getItemLabels(
  language: Language,
): Record<Item["kind"], string> {
  return {
    tomato: text(language, "Tomato", "番茄"),
    sausage: text(language, "Sausage", "香肠"),
    cheese: text(language, "Cheese", "芝士"),
    dough: text(language, "Dough", "面饼"),
    knife: text(language, "Knife", "菜刀"),
    cloth: text(language, "Cloth", "抹布"),
    whisk: text(language, "Whisk", "打蛋器"),
    "oven-mitt": text(language, "Oven mitt", "隔热手套"),
    "pizza-cutter": text(language, "Pizza cutter", "披萨刀"),
    pizza: "Pizza",
  };
}
export const emoji: Partial<Record<Item["kind"], string>> = {
  tomato: "🍅",
  sausage: "🌭",
  cheese: "🧀",
  dough: "🫓",
  pizza: "🍕",
};
export const toolImages: Record<string, string> = {
  knife: "knife",
  cloth: "rag",
  whisk: "whisk",
  "oven-mitt": "oven-mitt",
  "pizza-cutter": "pizza-cutter",
};
export function heldInput(
  item: Item,
  language: Language = DEFAULT_LANGUAGE,
): HeldItem {
  const labels = getItemLabels(language);
  return item.homeStation
    ? {
        id: item.id,
        kind: "tool",
        label: labels[item.kind],
        tool:
          item.kind === "knife" || item.kind === "pizza-cutter"
            ? "knife"
            : "spoon",
        homeSceneId: item.homeStation,
      }
    : { id: item.id, kind: "ingredient", label: labels[item.kind] };
}
export interface Target {
  input: InteractionTarget;
  action: KitchenAction;
  visual: string;
  item?: Item;
}
const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});
export function gameTargets(
  room: RoomState,
  station: StationId,
  held: Item | undefined,
  language: Language = DEFAULT_LANGUAGE,
): { targets: Target[]; actionTarget: ActionTarget | null } {
  const labels = getItemLabels(language);
  const k = room.kitchen,
    area = k.stations[station],
    onBoard = k.items[area.occupiedItemId ?? ""];
  const targets: Target[] = [];
  function target(
    id: string,
    label: string,
    bounds: Rect,
    action: KitchenAction,
    visual: string,
    item?: Item,
    allowed = true,
    reason?: string,
  ) {
    const common = { id, label, bounds, allowed, reason };
    const input: InteractionTarget =
      item && !held
        ? { ...common, kind: "pickup", item: heldInput(item, language) }
        : { ...common, kind: held ? "place" : "activate" };
    targets.push({ input, action, visual, item });
  }
  if (station === "storage-sink") {
    FOODS.forEach((kind, i) =>
      target(
        `food-${kind}`,
        text(language, `Pick up ${labels[kind]}`, `拿取${labels[kind]}`),
        rect(
          0.047 + (i % 2) * 0.18,
          0.08 + Math.floor(i / 2) * 0.215,
          0.155,
          0.165,
        ),
        { type: "PICKUP_STORAGE", ingredient: kind },
        "food",
        { id: `storage:${kind}`, kind } as Item,
        !held,
        text(
          language,
          "Put down the item you are carrying first.",
          "请先放下物品。",
        ),
      ),
    );
    target(
      "faucet",
      k.faucetOn
        ? text(language, "Turn off faucet", "关闭水龙头")
        : text(language, "Turn on faucet", "打开水龙头"),
      rect(0.847, 0.271, 0.067, 0.088),
      { type: "TOGGLE_FAUCET" },
      "faucet",
      undefined,
      !held && k.waterRemaining > 0,
      text(
        language,
        "You need an empty hand and water remaining.",
        "需要空手且有剩余水量。",
      ),
    );
    target(
      "work",
      held
        ? text(language, "Place in sink", "放入水池")
        : onBoard
          ? text(
              language,
              `Pick up tomato · ${onBoard.cleanliness}%`,
              `拿起番茄 · ${onBoard.cleanliness}%`,
            )
          : text(language, "Sink", "水池"),
      rect(0.517, 0.472, 0.428, 0.296),
      held
        ? { type: "PLACE_ITEM" }
        : { type: "PICKUP_ITEM", itemId: onBoard?.id ?? "" },
      "sink",
      onBoard,
      held?.kind === "tomato" || (!!onBoard && onBoard.cleanliness >= 92),
      held
        ? text(language, "Only tomatoes need washing.", "只有番茄需要清洗。")
        : text(
            language,
            "Move your hand or drag the tomato so every side passes through the water.",
            "移动手或拖动番茄，让每一面经过水流。",
          ),
    );
  } else if (station.startsWith("board")) {
    target(
      "work",
      held?.kind === "knife"
        ? text(language, "Chop up and down", "上下切菜")
        : held?.kind === "cloth"
          ? text(language, "Wipe left and right", "左右擦拭")
          : held
            ? text(language, "Place on board", "放上菜板")
            : onBoard
              ? text(language, "Pick up ingredient", "拿起食材")
              : text(language, "Empty cutting board", "空菜板"),
      rect(0.22, 0.39, 0.59, 0.37),
      held
        ? { type: "PLACE_ITEM" }
        : { type: "PICKUP_ITEM", itemId: onBoard?.id ?? "" },
      "board",
      onBoard,
      held ? !held.homeStation && !onBoard : !!onBoard,
      text(
        language,
        "Use tools on the board; use an empty hand to pick up ingredients.",
        "在菜板上使用工具；空手可以拿起食材。",
      ),
    );
    target(
      "trash",
      text(language, "Discard ingredient", "丢弃食材"),
      rect(0.026, 0.191, 0.254, 0.078),
      { type: "DISCARD" },
      "trash",
      undefined,
      !!held && FOODS.includes(held.kind as (typeof FOODS)[number]),
      text(
        language,
        "Only ingredients can go in the bin.",
        "垃圾桶只接受食材。",
      ),
    );
  } else {
    target(
      "oven",
      held?.kind === "oven-mitt"
        ? text(language, "Take out pizza", "取出 Pizza")
        : text(language, "Add to oven", "放入烤箱"),
      rect(0.63, 0.43, 0.255, 0.2),
      held?.kind === "oven-mitt"
        ? { type: "TAKE_PIZZA" }
        : { type: "ADD_TO_OVEN" },
      "oven",
      undefined,
      !!held &&
        (held.kind === "oven-mitt"
          ? k.oven.status === "ready"
          : FOODS.includes(held.kind as (typeof FOODS)[number])),
      text(
        language,
        "Add prepared ingredients; use the oven mitt when the pizza is ready.",
        "食材准备好后放入；烤好后使用隔热手套。",
      ),
    );
    target(
      "work",
      text(language, "Slice pizza", "切开 Pizza"),
      rect(0.07, 0.44, 0.39, 0.39),
      { type: "SLICE_PIZZA" },
      "pass",
      onBoard,
      false,
      text(
        language,
        "Take out the pizza, return the mitt, then slice with the pizza cutter.",
        "取出 Pizza，归还手套，再拿披萨刀上下切。",
      ),
    );
  }
  const positions: Record<string, Rect> = {
    cloth: rect(0.4, 0.018, 0.141, 0.268),
    knife: rect(0.599, 0.018, 0.142, 0.27),
    whisk: rect(0.76, 0.018, 0.142, 0.27),
    "oven-mitt": rect(0.044, 0.049, 0.13, 0.156),
    "pizza-cutter": rect(0.472, 0.514, 0.081, 0.312),
  };
  for (const item of Object.values(k.items).filter(
    (i) => i.homeStation === station,
  ))
    target(
      `tool-${item.kind}`,
      held?.id === item.id
        ? text(
            language,
            `Return ${labels[item.kind]}`,
            `归还${labels[item.kind]}`,
          )
        : text(
            language,
            `Pick up ${labels[item.kind]}`,
            `拿取${labels[item.kind]}`,
          ),
      positions[item.kind],
      held?.id === item.id
        ? { type: "RETURN_TOOL" }
        : { type: "PICKUP_ITEM", itemId: item.id },
      "tool",
      item,
      held ? held.id === item.id : item.location === "home",
      text(
        language,
        "This tool is in use, or you need an empty hand first.",
        "工具正在使用中，或需要先空手。",
      ),
    );
  let actionTarget: ActionTarget | null = null;
  if (!held && onBoard?.kind === "dough" && onBoard.stretchProgress < 100)
    actionTarget = {
      itemId: onBoard.id,
      action: "STRETCH",
      zoneId: "work",
      allowed: true,
    };
  else if (
    onBoard &&
    ((held?.kind === "knife" && onBoard.cutProgress < 100) ||
      (held?.kind === "pizza-cutter" && onBoard.kind === "pizza"))
  )
    actionTarget = {
      itemId: onBoard.id,
      action: "CHOP",
      zoneId: "work",
      allowed: true,
    };
  return { targets, actionTarget };
}
export function intentAction(
  intent: KitchenIntent,
  targets: Target[],
  held: Item | undefined,
): KitchenAction | null {
  if (intent.type === "action") {
    if (intent.action === "STRETCH") {
      const boardItem = targets.find((t) => t.input.id === "work")?.item;
      return !held &&
        intent.heldItemId === null &&
        boardItem?.kind === "dough" &&
        intent.itemId === boardItem.id
        ? { type: "STRETCH" }
        : null;
    }
    if (!held || intent.heldItemId !== held.id) return null;
    if (
      intent.action !== "CHOP" ||
      targets.find((t) => t.input.id === "work")?.item?.id !== intent.itemId
    )
      return null;
    return held.kind === "pizza-cutter"
      ? { type: "SLICE_PIZZA" }
      : held.kind === "knife"
        ? { type: "CHOP" }
        : null;
  }
  const target = targets.find((t) => t.input.id === intent.targetId);
  if (!target?.input.allowed || target.input.kind !== intent.type) return null;
  if (intent.type === "place" && intent.itemId !== held?.id) return null;
  if (
    intent.type === "pickup" &&
    (target.input.kind !== "pickup" || intent.itemId !== target.input.item.id)
  )
    return null;
  return target.action;
}
