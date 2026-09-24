import { describe, expect, it } from "vitest";
import { resolveMeasurement, requiresScale } from "../src/measurement.js";

const scale = { mmPerPixel: 100 }; // 1 px = 100 mm

describe("resolveMeasurement", () => {
  it("count ignores scale entirely", () => {
    expect(resolveMeasurement({ type: "count", points: [], explicitValue: 12 }, null)).toBe(12);
    expect(requiresScale("count")).toBe(false);
  });

  it("length sums a polyline in millimetres", () => {
    const m = { type: "length" as const, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] };
    expect(resolveMeasurement(m, scale)).toBeCloseTo(2000, 6);
  });

  it("area returns square millimetres", () => {
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    // 100 sq px x 100mm x 100mm = 1,000,000 sq mm = 1 sq m
    expect(resolveMeasurement({ type: "area", points: square }, scale)).toBeCloseTo(1_000_000, 3);
  });

  it("deduct is negative so it sums with area", () => {
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const a = resolveMeasurement({ type: "area", points: square }, scale)!;
    const d = resolveMeasurement({ type: "deduct", points: square }, scale)!;
    expect(a + d).toBeCloseTo(0, 6);
  });

  it("perimeter closes the polygon", () => {
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(resolveMeasurement({ type: "perimeter", points: square }, scale)).toBeCloseTo(4000, 6);
  });

  it("every geometric type returns null when uncalibrated", () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }];
    for (const type of ["length", "area", "perimeter", "deduct"] as const) {
      expect(resolveMeasurement({ type, points: pts }, null)).toBeNull();
      expect(requiresScale(type)).toBe(true);
    }
  });
});
