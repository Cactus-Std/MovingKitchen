export type ToolId = "knife" | "spoon" | "jug" | "salt" | "dough";
export type Action = "CHOP" | "STIR" | "POUR" | "SPRINKLE" | "KNEAD";
export type Source = "gesture" | "debug";
export interface MotionMetrics {
  startedAt: number;
  endedAt: number;
  durationMs: number;
  cyclesPerSecond: number;
  distance: number;
  meanSpeed: number;
  peakSpeed: number;
  sampleCount: number;
  unit:
    | "frame-heights/s"
    | "frame-widths/s"
    | "normalized-units/s"
    | "degrees/s"
    | "palm-widths/s";
}
export type InputStatus =
  "idle" | "loading" | "ready" | "no-hand" | "denied" | "error";
export interface Point {
  x: number;
  y: number;
  z?: number;
}
export interface Hand {
  id: string;
  palm: Point;
  open: boolean;
  fist: boolean;
  pinch: number;
  angle: number;
  points: Point[];
}
export interface Frame {
  time: number;
  hands: Hand[];
}
export type KitchenEvent =
  | { type: "grab"; tool: ToolId; source: Source; detectedAt: number }
  | { type: "release"; tool: ToolId; source: Source; detectedAt: number }
  | {
      type: "action";
      tool: ToolId;
      action: Action;
      source: Source;
      detectedAt: number;
      metrics: MotionMetrics | null;
    };
export interface InputView {
  held: ToolId | null;
  hover: ToolId | "drop" | null;
  cursor: Point | null;
  pose: "open" | "fist" | "moving" | "lost";
  progress: number;
  hint: string;
}
export const ACTIONS: Record<ToolId, Action> = {
  knife: "CHOP",
  spoon: "STIR",
  jug: "POUR",
  salt: "SPRINKLE",
  dough: "KNEAD",
};
export interface HitZone {
  id: ToolId | "drop";
  x: number;
  y: number;
  width: number;
  height: number;
}
