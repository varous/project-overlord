import { describe, expect, it } from "vitest";
import { isPositiveDistance, modeBarHint } from "./mode-bar-hint.js";
import type { CanvasMode } from "./canvas-mode.js";

describe("modeBarHint (QA-06, QA-19)", () => {
  it("does not keep calibrate copy after confirm when Select is active", () => {
    expect(
      modeBarHint({
        canvasMode: { kind: "tool", tool: "Select" },
        mapState: "calibrated",
      }),
    ).toBe("Click to select · pick a package in Assets to place");
  });

  it("uses calibrate copy only while the mode is calibrate", () => {
    const canvasMode: CanvasMode = { kind: "calibrate", phase: "a", points: [] };
    expect(
      modeBarHint({
        canvasMode,
        mapState: "map_uncalibrated",
      }),
    ).toMatch(/first point/i);
  });

  it("place mode cannot emit calibrate copy — the kind is exclusive", () => {
    expect(
      modeBarHint({
        canvasMode: { kind: "place", packageId: "PKG_GENSET125" },
        mapState: "map_uncalibrated",
        placingName: "Genset 125 kVA Drop",
      }),
    ).toMatch(/Click to place Genset/);
    expect(
      modeBarHint({
        canvasMode: { kind: "place", packageId: "PKG_GENSET125" },
        mapState: "map_uncalibrated",
        placingName: "Genset 125 kVA Drop",
      }),
    ).not.toMatch(/calibrate|first point/i);
  });

  it("measure copy lives on kind measure, not on a tool string", () => {
    expect(
      modeBarHint({
        canvasMode: { kind: "measure", points: [] },
        mapState: "calibrated",
      }),
    ).toMatch(/Click two points/i);
    expect(
      modeBarHint({
        canvasMode: { kind: "measure", points: [] },
        mapState: "calibrated",
      }),
    ).not.toMatch(/calibrate|place/i);
    expect(
      modeBarHint({
        canvasMode: { kind: "tool", tool: "Measure distance" },
        mapState: "calibrated",
      }),
    ).toBe("Select a tool");
  });
});

describe("isPositiveDistance (QA-03)", () => {
  it("rejects empty and non-positive", () => {
    expect(isPositiveDistance("")).toBe(false);
    expect(isPositiveDistance("10")).toBe(true);
    expect(isPositiveDistance("0")).toBe(false);
    expect(isPositiveDistance("-3")).toBe(false);
  });
});
