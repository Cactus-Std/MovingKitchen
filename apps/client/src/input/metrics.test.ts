import { expect, it } from "vitest";
import { measureMotion } from "./metrics";
it("measures the observed stroke and excludes leading stationary samples", () => {
  const result = measureMotion("knife", [
    { time: 100, values: [0.4] },
    { time: 200, values: [0.4] },
    { time: 300, values: [0.46] },
    { time: 400, values: [0.4] },
  ]);
  expect(result.startedAt).toBe(200);
  expect(result.durationMs).toBe(200);
  expect(result.cyclesPerSecond).toBe(5);
  expect(result.meanSpeed).toBeCloseTo(0.6);
  expect(result.peakSpeed).toBeCloseTo(0.6);
  expect(result.sampleCount).toBe(3);
  expect(result.unit).toBe("frame-heights/s");
});
it("uses angular degrees and handles crossing the angle boundary", () => {
  const result = measureMotion("jug", [
    { time: 0, values: [(Math.PI * 179) / 180] },
    { time: 100, values: [(-Math.PI * 179) / 180] },
  ]);
  expect(result.distance).toBeCloseTo(2);
  expect(result.meanSpeed).toBeCloseTo(20);
  expect(result.unit).toBe("degrees/s");
});
it("keeps the different movement units explicit", () => {
  expect(
    measureMotion("spoon", [
      { time: 0, values: [0.1, 0.1] },
      { time: 100, values: [0.4, 0.5] },
    ]),
  ).toMatchObject({ unit: "normalized-units/s", distance: 0.5 });
  expect(
    measureMotion("salt", [
      { time: 0, values: [0.2] },
      { time: 100, values: [0.6] },
    ]).unit,
  ).toBe("palm-widths/s");
});
