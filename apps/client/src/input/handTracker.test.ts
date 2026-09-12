import { expect, it } from "vitest";
import { HandTracker } from "./handTracker";
import type { Hand } from "./types";
const hand = (id: string, x: number): Hand => ({
  id,
  palm: { x, y: 0.4 },
  open: true,
  fist: false,
  pinch: 0.8,
  angle: 0,
  points: [],
});
it("keeps distinct stable IDs when both model labels temporarily match", () => {
  const tracker = new HandTracker();
  const initial = tracker.update([hand("Left", 0.3), hand("Right", 0.7)], 0);
  const duplicate = tracker.update(
    [hand("Right", 0.31), hand("Right", 0.69)],
    33,
  );
  expect(duplicate.map((h) => h.id)).toEqual(initial.map((h) => h.id));
  expect(new Set(duplicate.map((h) => h.id)).size).toBe(2);
});
it("handles result reordering and preserves the remaining hand when one disappears", () => {
  const tracker = new HandTracker();
  const initial = tracker.update([hand("Left", 0.3), hand("Right", 0.7)], 0);
  const swapped = tracker.update([hand("Right", 0.68), hand("Left", 0.32)], 33);
  expect(swapped.map((h) => h.id)).toEqual([initial[1].id, initial[0].id]);
  expect(tracker.update([hand("Right", 0.67)], 66)[0].id).toBe(initial[1].id);
  tracker.update([], 1000);
  expect(tracker.update([hand("Left", 0.45)], 2000)[0].id).toBe(initial[0].id);
});
it("does not give a newly appearing opposite hand the absent operating hand ID", () => {
  const tracker = new HandTracker();
  const original = tracker.update([hand("Left", 0.3)], 0)[0];
  tracker.update([], 100);
  expect(tracker.update([hand("Right", 0.7)], 200)[0].id).not.toBe(original.id);
  expect(tracker.update([hand("Left", 0.31)], 800)[0].id).toBe(original.id);
});
it("keeps a nearby returning hand stable even if its handedness label changed during loss", () => {
  const tracker = new HandTracker();
  const original = tracker.update([hand("Left", 0.3)], 0)[0];
  tracker.update([], 100);
  expect(tracker.update([hand("Right", 0.31)], 600)[0].id).toBe(original.id);
});
