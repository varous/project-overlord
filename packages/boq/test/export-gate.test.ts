import { describe, expect, it } from "vitest";
import {
  formatExportBlockedMessage,
  geometryExportBlockers,
  isGeometryDependentQtyRule,
} from "../src/export-gate.js";

describe("isGeometryDependentQtyRule", () => {
  it("is true for PER_AREA, PER_LENGTH, PER_FRONT_FACE and PER_VOLUME", () => {
    expect(isGeometryDependentQtyRule("PER_AREA")).toBe(true);
    expect(isGeometryDependentQtyRule("PER_LENGTH")).toBe(true);
    expect(isGeometryDependentQtyRule("PER_FRONT_FACE")).toBe(true);
    expect(isGeometryDependentQtyRule("PER_VOLUME")).toBe(true);
    expect(isGeometryDependentQtyRule("FIXED")).toBe(false);
    expect(isGeometryDependentQtyRule("PER_COUNT_PARAM")).toBe(false);
  });
});

describe("geometryExportBlockers", () => {
  const fixed = { itemCode: "PWR_GENSET", rule: { kind: "FIXED" as const, param: null } };
  const area = { itemCode: "FLR_CARPET", rule: { kind: "PER_AREA" as const, param: null }, label: "Carpet" };
  const length = { itemCode: "BRR_MOJO", rule: { kind: "PER_LENGTH" as const, param: null } };
  const face = { itemCode: "MISC_FRONFASC", rule: { kind: "PER_FRONT_FACE" as const, param: "height_ft" } };

  it("allows export with no scale when every line is count/fixed (no-map genset case)", () => {
    expect(geometryExportBlockers({ scale: null, lines: [fixed] })).toEqual([]);
  });

  it("blocks geometry lines when scale is null", () => {
    const blockers = geometryExportBlockers({ scale: null, lines: [fixed, area, length, face] });
    expect(blockers.map((b) => b.itemCode)).toEqual(["FLR_CARPET", "BRR_MOJO", "MISC_FRONFASC"]);
    expect(blockers[0]!.qtyRule).toBe("PER_AREA");
    expect(blockers[2]!.qtyRule).toBe("PER_FRONT_FACE");
    expect(formatExportBlockedMessage(blockers)).toContain("FLR_CARPET");
    expect(formatExportBlockedMessage(blockers)).toContain("calibrated scale");
  });

  it("clears the gate when scale is present", () => {
    expect(
      geometryExportBlockers({ scale: { mmPerPixel: 10 }, lines: [area, length, face] }),
    ).toEqual([]);
  });

  it("does not block a show-level FIXED line when uncalibrated", () => {
    expect(
      geometryExportBlockers({
        scale: null,
        lines: [{ itemCode: "HK_PESTCONT", rule: { kind: "FIXED", param: null }, label: "Show" }],
      }),
    ).toEqual([]);
  });
});
