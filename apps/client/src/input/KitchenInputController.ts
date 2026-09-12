import { ACTIONS, type Frame, type Source, type ToolId } from "./types";
import { KitchenRecognizer } from "./recognizer";
import { StretchDetector } from "./StretchDetector";
import {
  INPUT_CONTRACT_VERSION,
  INTERACTION_RULES,
  type InputContext,
  type InteractionTarget,
  type KitchenInputView,
  type KitchenIntent,
  type Rect,
} from "./contracts";

export function contextKey(context: InputContext): string {
  const held = context.held;
  return JSON.stringify([
    context.contextId,
    context.playerId,
    context.sceneId,
    held?.id,
    held?.kind,
    held?.kind === "tool" ? held.tool : null,
    held?.kind === "tool" ? held.homeSceneId : null,
    context.actionTarget?.itemId,
    context.actionTarget?.action,
    context.actionTarget?.allowed,
    context.actionTarget?.zoneId,
  ]);
}
export function targetReason(
  target: InteractionTarget,
  context: InputContext,
): string | null {
  if (!context.playerId) return "等待宿主识别玩家身份";
  if (
    context.held?.kind === "tool" &&
    context.held.homeSceneId !== context.sceneId
  )
    return "工具属于其他工位，需要宿主归还工具";
  if (!target.allowed) return target.reason ?? "当前区域不可用";
  if (target.kind === "pickup" && context.held) return "请先放下手中的物品";
  if (target.kind === "place" && !context.held) return "当前是空手";
  if (target.kind === "activate" && context.held)
    return "请先放下物品，再操作开关";
  if (
    target.kind === "pickup" &&
    target.item.kind === "tool" &&
    target.item.homeSceneId !== context.sceneId
  )
    return "只能拿取当前工位的工具";
  return null;
}

export class KitchenInputController {
  private key = "";
  private ownerKey = "";
  private completedTarget: Rect | null = null;
  private hovered: string | null = null;
  private enteredAt = 0;
  private consumed = false;
  private lastFrame = -Infinity;
  private handId: string | null = null;
  private detector = new KitchenRecognizer();
  private stretch = new StretchDetector();
  view: KitchenInputView = {
    held: null,
    cursor: null,
    rotationRad: null,
    handState: "empty",
    hoverId: null,
    hoverLabel: null,
    progress: 0,
    valid: false,
    feedback: "把手移到物品上，保持片刻",
  };
  resetMotion() {
    this.hovered = null;
    this.consumed = false;
    this.view.progress = 0;
    this.view.hoverId = null;
    this.view.hoverLabel = null;
    this.view.valid = false;
    this.view.cursor = null;
    this.view.rotationRad = null;
    this.detector.suspend();
    this.stretch.reset();
    this.lastFrame = -Infinity;
  }
  reset() {
    this.key = "";
    this.ownerKey = "";
    this.completedTarget = null;
    this.handId = null;
    this.resetMotion();
  }
  private sync(context: InputContext, time: number) {
    const ownerKey = JSON.stringify([
      context.contextId,
      context.playerId,
      context.sceneId,
    ]);
    if (ownerKey !== this.ownerKey) {
      this.completedTarget = null;
      this.ownerKey = ownerKey;
    }
    const key = contextKey(context);
    if (key !== this.key) {
      this.resetMotion();
      this.key = key;
      const tool = Object.entries(ACTIONS).find(
        ([, action]) => action === context.actionTarget?.action,
      )?.[0] as ToolId | undefined;
      this.detector.setHeldTool(tool ?? null, time);
    }
    this.view.held = context.held;
    this.view.handState = context.held?.kind ?? "empty";
  }
  private base(context: InputContext, time: number, source: Source) {
    return {
      inputVersion: INPUT_CONTRACT_VERSION,
      intentId: crypto.randomUUID(),
      contextId: context.contextId,
      playerId: context.playerId!,
      sceneId: context.sceneId,
      source,
      detectedAt: time,
    };
  }
  confirm(
    target: InteractionTarget,
    context: InputContext,
    time: number,
    source: Source,
  ): KitchenIntent | null {
    const reason = targetReason(target, context);
    if (reason || context.pending) return null;
    this.completedTarget = target.bounds;
    const base = this.base(context, time, source);
    if (target.kind === "pickup")
      return {
        ...base,
        type: "pickup",
        targetId: target.id,
        itemId: target.item.id,
      };
    if (target.kind === "place")
      return {
        ...base,
        type: "place",
        targetId: target.id,
        itemId: context.held!.id,
      };
    return { ...base, type: "activate", targetId: target.id };
  }
  debugAction(context: InputContext, time: number): KitchenIntent | null {
    if (!this.canAct(context)) return null;
    return {
      ...this.base(context, time, "debug"),
      type: "action",
      itemId: context.actionTarget!.itemId,
      heldItemId: context.held!.id,
      action: context.actionTarget!.action,
      metrics: null,
    };
  }
  private canAct(context: InputContext): boolean {
    if (
      !context.playerId ||
      !context.held ||
      !context.actionTarget?.allowed ||
      context.pending
    )
      return false;
    if (context.held.kind === "tool")
      return (
        context.held.homeSceneId === context.sceneId &&
        ACTIONS[context.held.tool] === context.actionTarget.action
      );
    return ["STRETCH", "KNEAD", "SPRINKLE"].includes(
      context.actionTarget.action,
    );
  }
  update(
    frame: Frame,
    context: InputContext,
    targets: InteractionTarget[],
    enabled: boolean,
    source: Source = "gesture",
  ): KitchenIntent | null {
    this.sync(context, frame.time);
    const hand =
      frame.hands.find((hand) => hand.id === this.handId) ?? frame.hands[0];
    if (!hand) {
      this.resetMotion();
      this.view.cursor = null;
      this.view.rotationRad = null;
      this.view.feedback = context.held
        ? "物品仍在携带槽中，等待手部回来"
        : "请把手放进画面";
      return null;
    }
    if (
      hand.id !== this.handId ||
      frame.time - this.lastFrame > INTERACTION_RULES.maxFrameGapMs
    )
      this.resetMotion();
    this.handId = hand.id;
    this.lastFrame = frame.time;
    this.view.cursor = {
      x: Math.max(0, Math.min(1, hand.palm.x)),
      y: Math.max(0, Math.min(1, hand.palm.y)),
    };
    this.view.rotationRad = hand.angle;
    if (!enabled || !context.playerId) {
      this.resetMotion();
      this.view.feedback = !context.playerId
        ? "等待宿主识别玩家身份"
        : "交互已暂停";
      return null;
    }
    if (context.pending) {
      this.detector.suspend();
      this.stretch.reset();
      this.view.feedback = "等待宿主确认";
      return null;
    }
    if (this.completedTarget) {
      const r = this.completedTarget;
      if (
        hand.palm.x >= r.x &&
        hand.palm.x <= r.x + r.width &&
        hand.palm.y >= r.y &&
        hand.palm.y <= r.y + r.height
      ) {
        this.view.progress = 0;
        this.view.valid = false;
        this.view.feedback = "先移出这个区域，再进行下一次操作";
        return null;
      }
      this.completedTarget = null;
    }
    let hit: InteractionTarget | undefined = targets
      .filter((target) =>
        context.held ? target.kind !== "pickup" : target.kind !== "place",
      )
      .filter((target) => {
        const r = target.bounds;
        return (
          hand.palm.x >= r.x &&
          hand.palm.x <= r.x + r.width &&
          hand.palm.y >= r.y &&
          hand.palm.y <= r.y + r.height
        );
      })
      .sort((a, b) => {
        const distance = (target: InteractionTarget) =>
          Math.hypot(
            hand.palm.x - target.bounds.x - target.bounds.width / 2,
            hand.palm.y - target.bounds.y - target.bounds.height / 2,
          );
        return distance(a) - distance(b) || a.id.localeCompare(b.id);
      })[0];
    const inActionZone = !!(
      this.canAct(context) &&
      context.actionTarget?.zoneId &&
      hit?.id === context.actionTarget.zoneId
    );
    if (inActionZone) hit = undefined;
    this.view.hoverId = hit?.id ?? null;
    this.view.hoverLabel = hit?.label ?? null;
    this.view.progress = 0;
    this.view.valid = false;
    if (hit) {
      this.detector.suspend();
      this.stretch.reset();
      const reason = targetReason(hit, context);
      if (reason) {
        this.hovered = null;
        this.consumed = false;
        this.view.feedback = reason;
        return null;
      }
      this.view.valid = true;
      if (this.hovered !== hit.id) {
        this.hovered = hit.id;
        this.enteredAt = frame.time;
        this.consumed = false;
      }
      const duration =
        hit.kind === "place"
          ? INTERACTION_RULES.placeMs
          : hit.kind === "activate"
            ? INTERACTION_RULES.activateMs
            : INTERACTION_RULES.pickupMs;
      this.view.progress = Math.min(
        1,
        (frame.time - this.enteredAt) / duration,
      );
      this.view.feedback = this.consumed
        ? "等待物品状态更新"
        : `${hit.label} · 保持位置确认`;
      if (this.view.progress === 1 && !this.consumed) {
        this.consumed = true;
        return this.confirm(hit, context, frame.time, source);
      }
      return null;
    }
    this.hovered = null;
    this.consumed = false;
    this.view.feedback = context.held
      ? "移动到有效区域放下，或执行当前动作"
      : "悬停在物品上约0.8秒拿取";
    if (
      !this.canAct(context) ||
      (context.actionTarget?.zoneId && !inActionZone)
    ) {
      this.detector.suspend();
      this.stretch.reset();
      if (context.actionTarget?.zoneId && context.actionTarget.allowed)
        this.view.feedback = "将工具移到指定菜板区域再操作";
      return null;
    }
    this.view.feedback =
      context.actionTarget!.action === "STRETCH"
        ? "双手靠近，再向两侧展开"
        : "执行当前物品对应的动作";
    if (context.actionTarget!.action === "STRETCH") {
      const metrics = this.stretch.update(frame);
      if (metrics)
        return {
          ...this.base(context, frame.time, source),
          type: "action",
          itemId: context.actionTarget!.itemId,
          heldItemId: context.held!.id,
          action: "STRETCH",
          metrics: source === "gesture" ? metrics : null,
        };
      return null;
    }
    const event = this.detector
      .update(frame, [], true)
      .find((event) => event.type === "action");
    if (event?.type === "action")
      return {
        ...this.base(context, frame.time, source),
        type: "action",
        itemId: context.actionTarget!.itemId,
        heldItemId: context.held!.id,
        action: event.action,
        metrics: source === "gesture" ? event.metrics : null,
      };
    return null;
  }
}
