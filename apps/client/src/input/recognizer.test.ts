import { describe, expect, it } from "vitest";
import { KitchenRecognizer } from "./recognizer";
import type { Hand, HitZone, KitchenEvent, ToolId } from "./types";
const zone: HitZone[] = [
  { id: "knife", x: 0.1, y: 0.7, width: 0.2, height: 0.25 },
  { id: "drop", x: 0.8, y: 0.05, width: 0.2, height: 0.3 },
];
const hand = (patch: Partial<Hand> = {}): Hand => ({
  id: "Left",
  palm: { x: 0.5, y: 0.4 },
  open: true,
  fist: false,
  pinch: 0.8,
  angle: 0,
  points: [],
  ...patch,
});
function rig(tool?: ToolId) {
  const engine = new KitchenRecognizer();
  let time = 0;
  const events: KitchenEvent[] = [];
  if (tool) engine.debugGrab(tool, 0);
  return {
    engine,
    events,
    frame: (hands: Hand[] = [hand()], dt = 75, enabled = true) => {
      time += dt;
      events.push(...engine.update({ time, hands }, zone, enabled));
    },
    wait: (hands: Hand[] = [hand()], n = 10) => {
      for (let i = 0; i < n; i++) {
        time += 75;
        events.push(...engine.update({ time, hands }, zone));
      }
    },
  };
}
describe("grabbing and releasing", () => {
  it("requires open targeting, grabs once, and does not count the fist as an action", () => {
    const r = rig();
    const at = { x: 0.2, y: 0.8 };
    r.wait([hand({ palm: at, open: false, fist: true })]);
    expect(r.events).toEqual([]);
    r.wait([hand({ palm: at })]);
    r.wait([hand({ palm: at, open: false, fist: true })], 20);
    expect(r.events.map((e) => e.type)).toEqual(["grab"]);
    expect(r.engine.view.held).toBe("knife");
  });
  it("does not release just because fingers open, and requires a sustained open hand in the drop zone", () => {
    const r = rig("salt");
    r.wait();
    expect(r.engine.view.held).toBe("salt");
    r.wait([hand({ palm: { x: 0.9, y: 0.2 }, open: false, fist: true })]);
    expect(r.engine.view.held).toBe("salt");
    r.frame([hand({ palm: { x: 0.9, y: 0.2 } })]);
    r.frame([hand({ palm: { x: 0.9, y: 0.2 } })]);
    expect(r.engine.view.held).toBe("salt");
    r.wait([hand({ palm: { x: 0.9, y: 0.2 } })]);
    expect(r.events.map((e) => e.type)).toEqual(["release"]);
  });
  it("keeps the item and restores a cursor when a hand returns under another track ID", () => {
    const r = rig("knife");
    r.wait();
    r.frame([]);
    expect(r.engine.view.held).toBe("knife");
    expect(r.engine.view.cursor).toBeNull();
    r.frame([hand({ id: "Right" })]);
    expect(r.engine.view.cursor).not.toBeNull();
    expect(r.events).toEqual([]);
    r.wait([hand({ id: "Right" })]);
    expect(r.engine.view.cursor).not.toBeNull();
    r.wait();
    expect(r.engine.view.cursor).not.toBeNull();
    expect(r.events).toEqual([]);
  });
  it("does not buffer disabled frames and preserves the held tool", () => {
    const r = rig("knife");
    r.wait();
    r.frame([hand({ palm: { x: 0.5, y: 0.55 } })]);
    r.frame([hand({ palm: { x: 0.5, y: 0.4 } })], 75, false);
    r.wait();
    expect(r.events).toEqual([]);
    expect(r.engine.view.held).toBe("knife");
  });
  it("reset clears ownership and the previous operating hand", () => {
    const r = rig("jug");
    r.wait();
    r.engine.reset();
    r.wait([hand({ id: "Right" })]);
    expect(r.engine.view.held).toBeNull();
    expect(r.engine.view.cursor).not.toBeNull();
  });
  it("reacquires a changed track without completing the old half-action, then accepts a fresh action", () => {
    const r = rig("knife");
    r.wait();
    r.frame([hand({ palm: { x: 0.5, y: 0.5 } })]);
    r.frame([]);
    r.wait([hand({ id: "replacement" })], 12);
    expect(r.events).toEqual([]);
    r.frame([hand({ id: "replacement", palm: { x: 0.5, y: 0.5 } })]);
    r.frame([hand({ id: "replacement" })]);
    expect(r.events).toMatchObject([{ action: "CHOP" }]);
  });
  it("keeps the current operating hand when both are visible and clamps cursor extrapolation to the board", () => {
    const r = rig("knife");
    r.wait();
    r.frame([hand({ id: "Right", palm: { x: 0.2, y: 0.2 } }), hand()]);
    expect(r.engine.view.cursor).toEqual({ x: 0.5, y: 0.4 });
    r.frame([hand({ palm: { x: 1.02, y: -0.01 } })]);
    expect(r.engine.view.cursor).toEqual({ x: 1, y: 0 });
  });
});
describe("kitchen actions", () => {
  it("accepts a small, fast chop without requiring a large swing", () => {
    const r = rig("knife");
    r.wait();
    r.frame([hand({ palm: { x: 0.5, y: 0.46 } })], 34);
    r.frame([hand({ palm: { x: 0.5, y: 0.405 } })], 34);
    expect(r.events).toMatchObject([{ action: "CHOP" }]);
  });
  it("accepts a quick circle from fewer sampled frames", () => {
    const r = rig("spoon");
    r.wait([hand({ palm: { x: 0.55, y: 0.4 } })]);
    for (let i = 0; i <= 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      r.frame(
        [
          hand({
            palm: {
              x: 0.5 + Math.cos(angle) * 0.05,
              y: 0.4 + Math.sin(angle) * 0.05,
            },
          }),
        ],
        34,
      );
    }
    expect(r.events).toMatchObject([{ action: "STIR" }]);
  });
  it("detects the first circle after moving from the shelf and excludes that transit from speed", () => {
    const r = rig("spoon");
    r.wait([hand({ palm: { x: 0.55, y: 0.8 } })]);
    for (const y of [0.7, 0.6, 0.5, 0.4])
      r.frame([hand({ palm: { x: 0.55, y } })]);
    for (let i = 0; i <= 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      r.frame(
        [
          hand({
            palm: {
              x: 0.5 + Math.cos(angle) * 0.05,
              y: 0.4 + Math.sin(angle) * 0.05,
            },
          }),
        ],
        34,
      );
    }
    expect(r.events).toHaveLength(1);
    const event = r.events[0];
    expect(event).toMatchObject({ action: "STIR" });
    if (event.type === "action")
      expect(event.metrics!.durationMs).toBeLessThanOrEqual(400);
  });
  it("accepts a modest tilt and a quick pinch release", () => {
    const jug = rig("jug");
    jug.wait();
    jug.frame([hand({ angle: 0.55 })], 34);
    jug.frame([hand({ angle: 0.1 })], 34);
    expect(jug.events).toMatchObject([{ action: "POUR" }]);
    const salt = rig("salt");
    salt.wait();
    salt.frame([hand({ pinch: 0.35 })], 34);
    salt.frame([hand({ pinch: 0.6 })], 34);
    expect(salt.events).toMatchObject([{ action: "SPRINKLE" }]);
  });
  it("CHOP requires down then up, not stationary or horizontal motion", () => {
    const r = rig("knife");
    r.wait();
    for (let i = 0; i < 140; i++)
      r.frame([hand({ palm: { x: 0.5 + Math.sin(i) * 0.03, y: 0.4 } })]);
    expect(r.events).toEqual([]);
    r.frame([hand({ palm: { x: 0.5, y: 0.5 } })]);
    expect(r.events).toEqual([]);
    r.frame([hand({ palm: { x: 0.5, y: 0.4 } })]);
    expect(r.events).toMatchObject([
      { type: "action", action: "CHOP", source: "gesture" },
    ]);
    for (let i = 0; i < 4; i++)
      r.frame([hand({ palm: { x: 0.5, y: i % 2 ? 0.4 : 0.5 } })]);
    expect(r.events).toHaveLength(1);
  });
  it.each([1, -1])("STIR detects one circle in direction %s", (direction) => {
    const r = rig("spoon");
    r.wait([hand({ palm: { x: 0.6, y: 0.4 } })]);
    for (let i = 0; i <= 32; i++) {
      const angle = (i / 32) * Math.PI * 2 * direction;
      r.frame([
        hand({
          palm: {
            x: 0.5 + Math.cos(angle) * 0.1,
            y: 0.4 + Math.sin(angle) * 0.1,
          },
        }),
      ]);
    }
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({ action: "STIR" });
  });
  it("STIR rejects straight back-and-forth motions", () => {
    const r = rig("spoon");
    r.wait();
    for (let i = 0; i < 80; i++)
      r.frame([hand({ palm: { x: 0.5 + Math.sin(i / 4) * 0.15, y: 0.4 } })]);
    expect(r.events).toEqual([]);
  });
  it.each([0.9, -0.9])("POUR requires upright, tilt %s and return", (angle) => {
    const r = rig("jug");
    r.wait();
    r.frame([hand({ angle })]);
    expect(r.events).toEqual([]);
    r.frame([hand({ angle: 0 })]);
    expect(r.events).toMatchObject([{ action: "POUR" }]);
  });
  it("SPRINKLE requires pinch-release, excluding a grabbing fist", () => {
    const r = rig("salt");
    r.wait();
    r.frame([hand({ pinch: 0.1, fist: true, open: false })]);
    r.frame([hand()]);
    expect(r.events).toEqual([]);
    r.frame([hand({ pinch: 0.1 })]);
    r.frame([hand({ pinch: 0.1 })]);
    r.frame([hand()]);
    expect(r.events).toMatchObject([{ action: "SPRINKLE" }]);
  });
  it("KNEAD requires two open hands moving down and up", () => {
    const r = rig("dough");
    r.wait();
    r.frame([hand({ palm: { x: 0.5, y: 0.5 } })]);
    r.frame();
    expect(r.events).toEqual([]);
    const pair = (y: number) => [
      hand({ palm: { x: 0.4, y } }),
      hand({ id: "Right", palm: { x: 0.6, y } }),
    ];
    r.wait(pair(0.4));
    r.frame(pair(0.51));
    r.frame(pair(0.4));
    expect(r.events).toMatchObject([{ action: "KNEAD" }]);
  });
  it("a lost hand invalidates an unfinished chop even on quick return", () => {
    const r = rig("knife");
    r.wait();
    r.frame([hand({ palm: { x: 0.5, y: 0.52 } })]);
    r.frame([]);
    r.wait();
    expect(r.events).toEqual([]);
  });
  it("KNEAD does not count when only the second hand moves", () => {
    const r = rig("dough");
    const pair = (y: number) => [
      hand({ palm: { x: 0.4, y: 0.5 } }),
      hand({ id: "Right", palm: { x: 0.6, y } }),
    ];
    r.wait(pair(0.35));
    r.frame(pair(0.53));
    r.frame(pair(0.35));
    expect(r.events).toEqual([]);
  });
  it("a long video-frame gap invalidates unfinished action", () => {
    const r = rig("jug");
    r.wait();
    r.frame([hand({ angle: 1 })]);
    r.frame([hand()], 500);
    r.wait();
    expect(r.events).toEqual([]);
  });
  it("release area suppresses pinch-release actions", () => {
    const r = rig("salt");
    r.wait();
    r.frame([hand({ pinch: 0.1 })]);
    r.wait([hand({ palm: { x: 0.9, y: 0.2 } })]);
    expect(r.events.map((e) => e.type)).toEqual(["release"]);
  });
  it("debug events are tagged, throttled, and cannot replace a held item", () => {
    const r = rig("knife");
    expect(r.engine.debugGrab("salt", 500)).toBeNull();
    expect(r.engine.debugAction(100)).toBeNull();
    expect(r.engine.debugAction(500)).toMatchObject({
      source: "debug",
      action: "CHOP",
    });
    expect(r.engine.debugAction(600)).toBeNull();
    expect(r.engine.release(700, "debug")).toMatchObject({
      source: "debug",
      tool: "knife",
    });
    expect(r.engine.view.held).toBeNull();
  });
});
