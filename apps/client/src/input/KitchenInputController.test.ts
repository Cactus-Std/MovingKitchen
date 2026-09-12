import { describe, expect, it } from "vitest";
import { KitchenInputController } from "./KitchenInputController";
import type {
  InputContext,
  InteractionTarget,
  KitchenIntent,
} from "./contracts";
import type { Hand } from "./types";
const ingredient = {
  id: "tomato-1",
  kind: "ingredient" as const,
  label: "番茄",
};
const base: InputContext = {
  contextId: "round-1",
  playerId: "p1",
  sceneId: "storage",
  held: null,
  actionTarget: null,
  pending: false,
};
const pickup: InteractionTarget = {
  id: "take-tomato",
  kind: "pickup",
  label: "番茄",
  bounds: { x: 0.3, y: 0.3, width: 0.4, height: 0.4 },
  allowed: true,
  item: ingredient,
};
const place: InteractionTarget = {
  id: "sink",
  kind: "place",
  label: "水池",
  bounds: { x: 0.3, y: 0.3, width: 0.4, height: 0.4 },
  allowed: true,
};
const hand = (x = 0.5, y = 0.5, fist = false): Hand => ({
  id: "hand",
  palm: { x, y },
  angle: 0.2,
  open: !fist,
  fist,
  pinch: 0.8,
  points: [],
});
function rig(context = base, targets: InteractionTarget[] = [pickup]) {
  const input = new KitchenInputController();
  const events: KitchenIntent[] = [];
  let time = 0;
  const frame = (x = 0.5, y = 0.5, enabled = true, fist = false) => {
    const result = input.update(
      { time, hands: [hand(x, y, fist)] },
      context,
      targets,
      enabled,
    );
    if (result) events.push(result);
    time += 100;
  };
  return {
    input,
    events,
    frame,
    wait: (n = 9) => {
      for (let i = 0; i < n; i++) frame();
    },
  };
}
describe("v0.2 dwell interaction", () => {
  it("confirms at 800ms without requiring a fist and never mutates the carried item", () => {
    const r = rig();
    r.wait(8);
    expect(r.events).toEqual([]);
    expect(r.input.view.progress).toBeCloseTo(0.875);
    r.frame();
    expect(r.events).toMatchObject([
      {
        type: "pickup",
        itemId: "tomato-1",
        inputVersion: "0.2",
        source: "gesture",
        playerId: "p1",
      },
    ]);
    expect(r.input.view.held).toBeNull();
    r.wait(10);
    expect(r.events).toHaveLength(1);
    r.input.update({ time: 2000, hands: [] }, base, [pickup], true);
    expect(r.input.view.valid).toBe(false);
  });
  it("selects the closest overlapping target regardless of array order", () => {
    const nearby: InteractionTarget = {
      ...pickup,
      id: "closer",
      bounds: { x: 0.4, y: 0.4, width: 0.2, height: 0.2 },
    };
    const r = rig(base, [
      { ...pickup, bounds: { x: 0, y: 0, width: 1, height: 0.6 } },
      nearby,
    ]);
    r.wait();
    expect(r.events[0]).toMatchObject({ targetId: "closer" });
  });
  it("cancels dwell when leaving, losing the hand, disabling or changing identity", () => {
    const r = rig();
    r.wait(7);
    r.frame(0.95, 0.95);
    r.wait(3);
    expect(r.events).toEqual([]);
    r.input.update({ time: 1050, hands: [] }, base, [pickup], true);
    expect(r.input.view.progress).toBe(0);
    r.input.update({ time: 1100, hands: [hand()] }, base, [pickup], false);
    expect(r.input.view.progress).toBe(0);
    const changed = { ...base, playerId: "p2" };
    r.input.update({ time: 1200, hands: [hand()] }, changed, [pickup], true);
    expect(r.input.view.progress).toBe(0);
  });
  it("places at 400ms even when the hand is not open", () => {
    const r = rig({ ...base, held: ingredient }, [place]);
    for (let i = 0; i < 4; i++) r.frame(0.5, 0.5, true, true);
    expect(r.events).toEqual([]);
    r.frame(0.5, 0.5, true, true);
    expect(r.events).toMatchObject([
      { type: "place", targetId: "sink", itemId: "tomato-1" },
    ]);
  });
  it("shows an explicit invalid reason and does not confirm forbidden targets", () => {
    const r = rig({ ...base, held: ingredient }, [
      { ...place, allowed: false, reason: "菜板已被占用" },
    ]);
    r.wait(20);
    expect(r.events).toEqual([]);
    expect(r.input.view.valid).toBe(false);
    expect(r.input.view.feedback).toBe("菜板已被占用");
  });
  it("allows activating a faucet only when empty-handed", () => {
    const target: InteractionTarget = {
      ...place,
      id: "faucet",
      kind: "activate",
    };
    const empty = rig(base, [target]);
    empty.wait();
    expect(empty.events[0]).toMatchObject({
      type: "activate",
      targetId: "faucet",
    });
    const held = rig({ ...base, held: ingredient }, [target]);
    held.wait();
    expect(held.events).toEqual([]);
  });
  it("retains an ingredient when the host restores it at another scene", () => {
    const r = rig({ ...base, held: ingredient }, []);
    r.wait();
    r.input.update(
      { time: 1000, hands: [] },
      { ...base, sceneId: "sink", held: ingredient },
      [],
      true,
    );
    expect(r.input.view.held).toEqual(ingredient);
    expect(r.input.view.handState).toBe("ingredient");
    expect(r.input.view.cursor).toBeNull();
  });
  it("does not auto-retry a target after an asynchronous rejection while still hovering", () => {
    const r = rig();
    r.wait();
    r.input.update(
      { time: 900, hands: [hand()] },
      { ...base, pending: true },
      [pickup],
      true,
    );
    expect(
      r.input.update({ time: 1000, hands: [hand()] }, base, [pickup], true),
    ).toBeNull();
  });
  it("rejects a tool carried from another scene", () => {
    const r = rig(
      {
        ...base,
        held: {
          id: "knife-a",
          kind: "tool",
          label: "刀",
          tool: "knife",
          homeSceneId: "board-1",
        },
      },
      [place],
    );
    r.wait();
    expect(r.events).toEqual([]);
    expect(r.input.view.feedback).toContain("其他工位");
  });
  it("blocks unknown identity, pending and disabled input including debug requests", () => {
    expect(rig({ ...base, playerId: null }).events).toEqual([]);
    const r = rig({ ...base, pending: true });
    r.wait();
    expect(r.events).toEqual([]);
    expect(
      r.input.confirm(pickup, { ...base, playerId: null }, 0, "debug"),
    ).toBeNull();
    expect(
      r.input.confirm(pickup, { ...base, pending: true }, 0, "debug"),
    ).toBeNull();
  });
});
describe("host-controlled action context", () => {
  const knife = {
    id: "knife-a",
    kind: "tool" as const,
    label: "刀",
    tool: "knife" as const,
    homeSceneId: "board-1",
  };
  const context: InputContext = {
    ...base,
    sceneId: "board-1",
    held: knife,
    actionTarget: { itemId: "tomato-1", action: "CHOP", allowed: true },
  };
  it("associates a cut with the exact food and held tool, including speed", () => {
    const r = rig(context, []);
    r.wait();
    r.frame(0.5, 0.6);
    r.frame();
    expect(r.events).toMatchObject([
      {
        type: "action",
        itemId: "tomato-1",
        heldItemId: "knife-a",
        action: "CHOP",
        metrics: { unit: "frame-heights/s" },
      },
    ]);
  });
  it("honors host auto-return after completion and does not carry old cutting progress", () => {
    const r = rig(context, []);
    r.wait();
    r.frame(0.5, 0.6);
    r.input.update(
      { time: 1100, hands: [hand()] },
      { ...context, held: null, actionTarget: null },
      [],
      true,
    );
    expect(r.input.view.held).toBeNull();
    expect(
      r.input.update(
        { time: 1200, hands: [hand(0.5, 0.6)] },
        { ...context, held: null, actionTarget: null },
        [],
        true,
      ),
    ).toBeNull();
  });
  it("processes cutting inside its board region instead of treating the occupied board as invalid placement", () => {
    const board: InteractionTarget = {
      ...place,
      id: "board-1",
      allowed: false,
      reason: "菜板已被占用",
    };
    const r = rig(
      {
        ...context,
        actionTarget: { ...context.actionTarget!, zoneId: "board-1" },
      },
      [board],
    );
    r.wait();
    r.frame(0.5, 0.6);
    r.frame();
    expect(r.events).toMatchObject([{ type: "action", action: "CHOP" }]);
    const outside = rig(
      {
        ...context,
        actionTarget: { ...context.actionTarget!, zoneId: "board-1" },
      },
      [board],
    );
    for (let i = 0; i < 10; i++) outside.frame(0.9, 0.4);
    outside.frame(0.9, 0.5);
    outside.frame(0.9, 0.4);
    expect(outside.events).toEqual([]);
  });
  it("rejects actions when the host marks food unavailable or the wrong tool is held", () => {
    const r = rig(
      {
        ...context,
        actionTarget: { itemId: "tomato-1", action: "CHOP", allowed: false },
      },
      [],
    );
    r.wait();
    r.frame(0.5, 0.6);
    r.frame();
    expect(r.events).toEqual([]);
    expect(
      r.input.debugAction({ ...context, held: ingredient }, 1200),
    ).toBeNull();
    expect(r.input.debugAction(context, 1200)).toMatchObject({
      source: "debug",
      metrics: null,
    });
  });
});
