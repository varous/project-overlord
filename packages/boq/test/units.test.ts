import { describe, expect, it } from "vitest";
import { formatDualLength, formatLength, fromMm, sqMmTo, toMm, toSqMm } from "../src/units.js";

describe("formatDualLength", () => {
  it("leads with the calibration unit and puts the other of m/ft in parentheses", () => {
    const mm = toMm(12.4, "m");
    expect(formatDualLength(mm, "m", 1)).toBe("12.4 m (40.7 ft)");
    expect(formatDualLength(mm, "ft", 1)).toMatch(/^40\.7 ft \(12\.4 m\)$/);
  });

  it("does not invent a third preference — cm still pairs with ft", () => {
    const mm = toMm(100, "cm");
    expect(formatDualLength(mm, "cm", 0)).toBe("100 cm (3 ft)");
  });
});

describe("formatLength", () => {
  it("is presentation only — canonical value stays millimetres", () => {
    expect(fromMm(1000, "m")).toBe(1);
    expect(formatLength(1000, "m")).toBe("1.00 m");
  });
});

describe("toSqMm", () => {
  it("is the inverse of sqMmTo", () => {
    expect(sqMmTo(toSqMm(100, "sqft"), "sqft")).toBeCloseTo(100);
    expect(toSqMm(sqMmTo(1_000_000, "sqm"), "sqm")).toBeCloseTo(1_000_000);
  });
});
