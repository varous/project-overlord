import { describe, expect, it } from "vitest";
import {
  CalibrationError,
  calibrationLooksImplausible,
  deriveScale,
  formatImplausibleCalibrationMessage,
  pixelsToMm,
  sqPixelsToSqMm,
  type Calibration,
} from "../src/scale.js";

const base: Omit<Calibration, "pointA" | "pointB" | "knownDistance"> = {
  knownUnit: "m",
  calibratedAt: "2026-08-12T00:00:00.000Z",
  calibratedByUserId: "u1",
};

describe("deriveScale", () => {
  it("derives mm per pixel from two points and a known distance", () => {
    // 100 px apart, told it is 10 m -> 100 mm per px
    const scale = deriveScale({
      ...base,
      pointA: { x: 0, y: 0 },
      pointB: { x: 100, y: 0 },
      knownDistance: 10,
    });
    expect(scale.mmPerPixel).toBeCloseTo(100, 9);
  });

  it("handles a diagonal calibration line", () => {
    // 3-4-5 triangle: 5 px apart, told it is 5 m -> 1000 mm per px
    const scale = deriveScale({
      ...base,
      pointA: { x: 0, y: 0 },
      pointB: { x: 3, y: 4 },
      knownDistance: 5,
    });
    expect(scale.mmPerPixel).toBeCloseTo(1000, 9);
  });

  it("throws when both points are identical", () => {
    expect(() =>
      deriveScale({
        ...base,
        pointA: { x: 7, y: 7 },
        pointB: { x: 7, y: 7 },
        knownDistance: 10,
      }),
    ).toThrow(CalibrationError);
  });

  it("throws on a zero or negative known distance", () => {
    for (const knownDistance of [0, -5]) {
      expect(() =>
        deriveScale({ ...base, pointA: { x: 0, y: 0 }, pointB: { x: 10, y: 0 }, knownDistance }),
      ).toThrow(CalibrationError);
    }
  });
});

describe("uncalibrated state", () => {
  it("returns null rather than guessing - README principle 2", () => {
    expect(pixelsToMm(500, null)).toBeNull();
    expect(sqPixelsToSqMm(500, null)).toBeNull();
  });
});

describe("area scaling", () => {
  it("squares the ratio", () => {
    const scale = { mmPerPixel: 10 };
    expect(sqPixelsToSqMm(1, scale)).toBe(100);
  });
});

describe("calibrationLooksImplausible (QA-04)", () => {
  it("flags a sub-20 m implied width as too small", () => {
    // 1000 px wide, 15 mm/px → 15 m (below banquet-hall floor)
    const r = calibrationLooksImplausible({ mmPerPixel: 15 }, 1000, 200);
    expect(r.implausible).toBe(true);
    expect(r.reasons).toContain("width_too_small");
    expect(formatImplausibleCalibrationMessage(r)).toMatch(/15 m wide/);
    expect(formatImplausibleCalibrationMessage(r)).toMatch(/smaller than most venues/);
  });

  it("allows ~22 m (banquet / margin-inflated plans sit here — do not cry wolf)", () => {
    const r = calibrationLooksImplausible({ mmPerPixel: 22 }, 1000, 200);
    expect(r.implausible).toBe(false);
  });

  it("accepts a banquet-hall-scale ~25 m plan (floor is 20 m)", () => {
    const r = calibrationLooksImplausible({ mmPerPixel: 25 }, 1000, 200);
    expect(r.implausible).toBe(false);
  });

  it("accepts a realistic festival ground (~300 m)", () => {
    expect(calibrationLooksImplausible({ mmPerPixel: 300 }, 1000, 200).implausible).toBe(false);
  });

  it("flags an absurdly large implied width", () => {
    const r = calibrationLooksImplausible({ mmPerPixel: 10_000 }, 1000, 200);
    expect(r.implausible).toBe(true);
    expect(r.reasons).toContain("width_too_large");
  });

  it("flags a short reference span even when width looks fine", () => {
    // 300 m across is fine, but segment is 40 px of 1000 = 4%
    const r = calibrationLooksImplausible({ mmPerPixel: 300 }, 1000, 40);
    expect(r.implausible).toBe(true);
    expect(r.reasons).toContain("span_too_short");
    expect(formatImplausibleCalibrationMessage(r)).toMatch(/very short/);
  });
});
