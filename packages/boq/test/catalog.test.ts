import { describe, expect, it } from "vitest";
import { parseQtyRule, qtyRuleForCanvasItem } from "../src/catalog.js";

describe("parseQtyRule", () => {
  it("parses PER_FRONT_FACE:height_ft the same way as PER_COUNT_PARAM", () => {
    expect(parseQtyRule("PER_FRONT_FACE:height_ft")).toEqual({
      kind: "PER_FRONT_FACE", param: "height_ft",
    });
    expect(parseQtyRule("PER_COUNT_PARAM:lanes")).toEqual({
      kind: "PER_COUNT_PARAM", param: "lanes",
    });
    expect(parseQtyRule("PER_VOLUME:height_ft")).toEqual({
      kind: "PER_VOLUME", param: "height_ft",
    });
  });

  it("rejects PER_FRONT_FACE without a parameter name", () => {
    expect(() => parseQtyRule("PER_FRONT_FACE")).toThrow(/requires a parameter name/);
    expect(() => parseQtyRule("PER_FRONT_FACE:")).toThrow(/requires a parameter name/);
  });

  it("rejects PER_VOLUME without a parameter name", () => {
    expect(() => parseQtyRule("PER_VOLUME")).toThrow(/requires a parameter name/);
  });
});

describe("qtyRuleForCanvasItem", () => {
  it("maps VOLUME to PER_VOLUME:height_ft, not FIXED", () => {
    expect(qtyRuleForCanvasItem("VOLUME")).toEqual({ kind: "PER_VOLUME", param: "height_ft" });
    expect(qtyRuleForCanvasItem("COUNT")).toEqual({ kind: "FIXED", param: null });
  });

  it("lets seed DATA override AREA to PER_FRONT_FACE", () => {
    expect(qtyRuleForCanvasItem("AREA", "PER_FRONT_FACE:height_ft")).toEqual({
      kind: "PER_FRONT_FACE", param: "height_ft",
    });
  });
});
