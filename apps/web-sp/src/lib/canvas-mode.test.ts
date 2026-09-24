import { describe, expect, it } from "vitest";
import { dataToolOf, railToolOf, SELECT_TOOL, type CanvasMode } from "./canvas-mode.js";

describe("CanvasMode exclusivity (QA-19)", () => {
  it("place is not calibrate — the kind is the whole mode", () => {
    const place: CanvasMode = { kind: "place", packageId: "PKG_GENSET125" };
    const cal: CanvasMode = { kind: "calibrate", phase: "a", points: [] };
    expect(place.kind).not.toBe(cal.kind);
    expect(dataToolOf(place)).toBe("Place");
    expect(dataToolOf(cal)).toBe("Calibrate");
    expect(railToolOf(place)).toBe("Select");
    expect(railToolOf(cal)).toBe("Select");
  });

  it("picking a rail tool is a different kind from place and calibrate", () => {
    expect(SELECT_TOOL.kind).toBe("tool");
    expect(dataToolOf(SELECT_TOOL)).toBe("Select");
  });

  it("measure is its own kind — not a tool string, and not live with place or calibrate", () => {
    const measure: CanvasMode = { kind: "measure", points: [] };
    const place: CanvasMode = { kind: "place", packageId: "PKG_GENSET125" };
    const cal: CanvasMode = { kind: "calibrate", phase: "a", points: [] };
    expect(measure.kind).not.toBe(place.kind);
    expect(measure.kind).not.toBe(cal.kind);
    expect(measure.kind).not.toBe(SELECT_TOOL.kind);
    expect(dataToolOf(measure)).toBe("Measure distance");
    expect(railToolOf(measure)).toBe("Measure distance");
  });
});

