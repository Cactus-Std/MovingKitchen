import type { Hand, Point } from "./types";
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

// Mirror here exactly once. The UI video is mirrored separately for display only.
export function handFeatures(raw: Point[], id: string): Hand | null {
  if (
    raw.length !== 21 ||
    raw.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
  )
    return null;
  const points = raw.map((p) => ({ ...p, x: 1 - p.x }));
  const wrist = points[0];
  const scale = Math.max(
    distance(points[5], points[17]),
    distance(wrist, points[9]),
    0.025,
  );
  const extended = [8, 12, 16, 20].filter(
    (tip) =>
      distance(points[tip], wrist) > distance(points[tip - 2], wrist) * 1.22,
  ).length;
  const palmPoints = [0, 5, 9, 13, 17].map((i) => points[i]);
  return {
    id,
    points,
    palm: {
      x: palmPoints.reduce((n, p) => n + p.x, 0) / 5,
      y: palmPoints.reduce((n, p) => n + p.y, 0) / 5,
    },
    open: extended >= 3,
    fist: extended === 0,
    pinch: distance(points[4], points[8]) / scale,
    angle: Math.atan2(points[9].x - wrist.x, wrist.y - points[9].y),
  };
}
