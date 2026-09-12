import { expect, it } from "vitest";
import { StretchDetector } from "./StretchDetector";
import type { Hand } from "./types";
const pair = (left: number, right: number, y = 0.4): Hand[] =>
  [left, right].map((x, i) => ({
    id: String(i),
    palm: { x, y },
    open: true,
    fist: false,
    pinch: 0.8,
    angle: 0,
    points: [],
  }));
it("detects two hands spreading sideways with width-based speed, once per expansion", () => {
  const input = new StretchDetector();
  input.update({ time: 0, hands: pair(0.4, 0.6) });
  expect(input.update({ time: 100, hands: pair(0.36, 0.64) })).toBeNull();
  expect(input.update({ time: 200, hands: pair(0.32, 0.68) })).toMatchObject({
    unit: "frame-widths/s",
    durationMs: 200,
  });
  expect(input.update({ time: 300, hands: pair(0.25, 0.75) })).toBeNull();
});
it("does not confuse vertical kneading or a single moving hand with spreading", () => {
  const input = new StretchDetector();
  input.update({ time: 0, hands: pair(0.4, 0.6) });
  expect(input.update({ time: 100, hands: pair(0.4, 0.6, 0.6) })).toBeNull();
  expect(input.update({ time: 200, hands: pair(0.4, 0.8) })).toBeNull();
});
it("discards partial expansion after a tracking gap or lost hand", () => {
  const input = new StretchDetector();
  input.update({ time: 0, hands: pair(0.4, 0.6) });
  input.update({ time: 100, hands: pair(0.35, 0.65) });
  input.update({ time: 200, hands: [] });
  expect(input.update({ time: 300, hands: pair(0.3, 0.7) })).toBeNull();
  expect(input.update({ time: 700, hands: pair(0.25, 0.75) })).toBeNull();
});
