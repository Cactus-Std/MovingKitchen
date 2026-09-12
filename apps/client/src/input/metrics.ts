import type { Hand, MotionMetrics, ToolId } from "./types";
export interface MotionSample {
  time: number;
  values: number[];
}
export function motionSample(
  tool: ToolId,
  hand: Hand,
  hands: Hand[],
  time: number,
): MotionSample | null {
  const other = hands.find((h) => h.id !== hand.id);
  if (tool === "dough" && !other) return null;
  const values =
    tool === "jug"
      ? [hand.angle]
      : tool === "salt"
        ? [hand.pinch]
        : tool === "spoon"
          ? [hand.palm.x, hand.palm.y]
          : tool === "dough"
            ? [hand.palm.y, other!.palm.y]
            : [hand.palm.y];
  return { time, values };
}
function displacement(
  tool: ToolId | "stretch",
  a: MotionSample,
  b: MotionSample,
) {
  const deltas = b.values.map((value, i) => value - a.values[i]);
  if (tool === "jug")
    return (
      (Math.abs(Math.atan2(Math.sin(deltas[0]), Math.cos(deltas[0]))) * 180) /
      Math.PI
    );
  if (tool === "spoon") return Math.hypot(...deltas);
  return (
    deltas.reduce((sum, value) => sum + Math.abs(value), 0) / deltas.length
  );
}
export function measureMotion(
  tool: ToolId | "stretch",
  samples: MotionSample[],
): MotionMetrics {
  const segments = samples.slice(1).map((sample, i) => ({
    start: samples[i].time,
    end: sample.time,
    distance: displacement(tool, samples[i], sample),
  }));
  const threshold = tool === "jug" ? 2 : tool === "salt" ? 0.04 : 0.004;
  const firstMoving = segments.findIndex(
    (segment) => segment.distance > threshold,
  );
  const active = segments.slice(Math.max(0, firstMoving));
  const startedAt = active[0]?.start ?? samples[0].time;
  const endedAt = samples[samples.length - 1].time;
  const durationMs = Math.max(1, endedAt - startedAt);
  const distance = active.reduce((sum, segment) => sum + segment.distance, 0);
  return {
    startedAt,
    endedAt,
    durationMs,
    cyclesPerSecond: 1000 / durationMs,
    distance,
    meanSpeed: (distance * 1000) / durationMs,
    peakSpeed: active.reduce(
      (peak, segment) =>
        Math.max(
          peak,
          (segment.distance * 1000) / Math.max(1, segment.end - segment.start),
        ),
      0,
    ),
    sampleCount: active.length + 1,
    unit:
      tool === "stretch"
        ? "frame-widths/s"
        : tool === "jug"
          ? "degrees/s"
          : tool === "salt"
            ? "palm-widths/s"
            : tool === "spoon"
              ? "normalized-units/s"
              : "frame-heights/s",
  };
}
