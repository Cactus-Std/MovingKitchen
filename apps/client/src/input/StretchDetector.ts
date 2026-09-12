import type { Frame, MotionMetrics } from "./types";
import { measureMotion, type MotionSample } from "./metrics";

export class StretchDetector {
  private base: [number, number] | null = null;
  private startedAt = 0;
  private lastFrame = -Infinity;
  private ids = "";
  private samples: MotionSample[] = [];
  private consumed = false;
  reset() {
    this.base = null;
    this.samples = [];
    this.lastFrame = -Infinity;
    this.ids = "";
    this.consumed = false;
  }
  update(frame: Frame): MotionMetrics | null {
    const hands = [...frame.hands].sort((a, b) => a.palm.x - b.palm.x);
    if (hands.length !== 2 || hands.some((hand) => !hand.open)) {
      this.reset();
      return null;
    }
    const ids = hands.map((hand) => hand.id).join("|");
    if (frame.time - this.lastFrame > 250 || ids !== this.ids) {
      this.reset();
    }
    this.lastFrame = frame.time;
    this.ids = ids;
    const left = hands[0].palm.x,
      right = hands[1].palm.x;
    const span = right - left;
    if (this.consumed) {
      if (span < 0.3) this.consumed = false;
      else return null;
    }
    if (!this.base) {
      if (span > 0.4) return null;
      this.base = [left, right];
      this.startedAt = frame.time;
      this.samples = [{ time: frame.time, values: [span] }];
      return null;
    }
    if (frame.time - this.startedAt > 2200) {
      this.base = null;
      this.samples = [];
      return null;
    }
    this.samples.push({ time: frame.time, values: [span] });
    if (
      this.base[0] - left >= 0.045 &&
      right - this.base[1] >= 0.045 &&
      span - (this.base[1] - this.base[0]) >= 0.12
    ) {
      const metrics = measureMotion("stretch", this.samples);
      this.consumed = true;
      this.base = null;
      this.samples = [];
      return metrics;
    }
    return null;
  }
}
