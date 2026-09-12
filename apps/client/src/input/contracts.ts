import type { Action, MotionMetrics, Point, Source, ToolId } from "./types";

/** Local frontend port version. This is not a Socket.IO protocol version. */
export const INPUT_CONTRACT_VERSION = "0.2" as const;
export type KitchenAction = Action | "STRETCH";
export type HeldItem =
  | { id: string; kind: "ingredient"; label: string; appearance?: string }
  | {
      id: string;
      kind: "tool";
      label: string;
      tool: ToolId;
      homeSceneId: string;
    };
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface TargetBase {
  id: string;
  label: string;
  bounds: Rect;
  allowed: boolean;
  reason?: string;
}
export type InteractionTarget =
  | (TargetBase & { kind: "pickup"; item: HeldItem })
  | (TargetBase & { kind: "place" | "activate" });
export interface ActionTarget {
  itemId: string;
  action: KitchenAction;
  zoneId?: string;
  allowed: boolean;
  reason?: string;
}
/** All item ownership and readiness comes from the receiving frontend. */
export interface InputContext {
  contextId: string;
  playerId: string | null;
  sceneId: string;
  held: HeldItem | null;
  actionTarget: ActionTarget | null;
  pending: boolean;
}
interface IntentBase {
  inputVersion: typeof INPUT_CONTRACT_VERSION;
  intentId: string;
  contextId: string;
  playerId: string;
  sceneId: string;
  source: Source;
  detectedAt: number;
}
export type KitchenIntent = IntentBase &
  (
    | { type: "pickup"; targetId: string; itemId: string }
    | { type: "place"; targetId: string; itemId: string }
    | { type: "activate"; targetId: string }
    | {
        type: "action";
        itemId: string;
        heldItemId: string;
        action: KitchenAction;
        metrics: MotionMetrics | null;
      }
  );
export type IntentResult = { ok: true } | { ok: false; reason: string };
export interface PoseSample {
  inputVersion: typeof INPUT_CONTRACT_VERSION;
  contextId: string;
  playerId: string;
  sceneId: string;
  heldItemId: string | null;
  source: Source;
  detectedAt: number;
  cursor: Point | null;
  rotationRad: number | null;
}
export interface KitchenInputView {
  held: HeldItem | null;
  cursor: Point | null;
  rotationRad: number | null;
  handState: "empty" | "ingredient" | "tool";
  hoverId: string | null;
  hoverLabel: string | null;
  progress: number;
  valid: boolean;
  feedback: string;
}
export const INTERACTION_RULES = {
  pickupMs: 800,
  placeMs: 400,
  activateMs: 800,
  maxFrameGapMs: 250,
} as const;
