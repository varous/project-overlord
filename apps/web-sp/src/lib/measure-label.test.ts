import { describe, expect, it } from "vitest";
import { canvasMeasureLabel, inspectorMeasureLabel } from "./measure-label.js";

const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
const scale = { mmPerPixel: 10 };

describe("measure labels", () => {
  it("returns null without a scale", () => {
    expect(canvasMeasureLabel(pts, null, "m")).toBeNull();
    expect(inspectorMeasureLabel(pts, null, "m")).toBeNull();
  });

  it("canvas is the calibration unit only — labels must not change length when selected", () => {
    expect(canvasMeasureLabel(pts, scale, "m")).toBe("1.0 m");
    expect(canvasMeasureLabel(pts, scale, "ft")).toBe("3.3 ft");
  });

  it("inspector keeps the dual reading for cross-check", () => {
    expect(inspectorMeasureLabel(pts, scale, "m")).toBe("1.0 m (3.3 ft)");
  });
});
