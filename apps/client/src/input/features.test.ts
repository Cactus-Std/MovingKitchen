import { expect, it } from "vitest";
import { handFeatures } from "./features";
import type { Point } from "./types";
function landmarks(fist = false): Point[] {
  const p = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  p[0] = { x: 0.5, y: 0.8 };
  [5, 9, 13, 17].forEach((base, i) => {
    p[base] = { x: 0.35 + i * 0.1, y: 0.6 };
    p[base + 1] = { x: p[base].x, y: 0.45 };
    p[base + 2] = { x: p[base].x, y: fist ? 0.65 : 0.3 };
    p[base + 3] = { x: p[base].x, y: fist ? 0.7 : 0.2 };
  });
  p[4] = { x: 0.2, y: 0.5 };
  return p;
}
it("mirrors exactly once and computes open/fist features from landmarks", () => {
  const open = handFeatures(landmarks(), "Left")!;
  expect(open.open).toBe(true);
  expect(open.fist).toBe(false);
  expect(open.points[5].x).toBeCloseTo(0.65);
  expect(open.angle).toBeCloseTo(Math.atan2(0.05, 0.2));
  const fist = handFeatures(landmarks(true), "Left")!;
  expect(fist.fist).toBe(true);
  expect(fist.open).toBe(false);
});
it("rejects malformed frames at the model boundary", () => {
  expect(handFeatures([], "Left")).toBeNull();
  const p = landmarks();
  p[5].x = NaN;
  expect(handFeatures(p, "Left")).toBeNull();
});
