import { describe, expect, it } from "vitest";
import { loadSynthetic } from "./fixtures/synthetic-bundle.js";
import { buildBoq } from "../src/boq.js";
import {
  countParamNames,
  defaultFootprintPx,
  defaultInstanceParams,
  instanceGeometryFromPx,
  resolveQty,
  variantFromTemplate,
} from "../src/instances.js";
import { toMm, toSqMm } from "../src/units.js";

const { catalogue } = loadSynthetic();

describe("placement params live on the instance, not the variant", () => {
  it("count params are the PER_COUNT_PARAM names, not width_ft/depth_ft", () => {
    const box = catalogue.packages.get("PKG_TEST_STAGE")!;
    expect(box.params).toEqual(["width_ft", "depth_ft", "counters", "height_ft"]);
    expect(countParamNames(box)).toEqual(["counters"]);
    expect(defaultInstanceParams(box)).toEqual({ counters: 1, height_ft: 8 });

    const gate = catalogue.packages.get("PKG_TEST_LIGHTING")!;
    expect(countParamNames(gate)).toEqual(["lanes"]);
  });

  it("two instances of one variant can have different counters", () => {
    const { variant } = variantFromTemplate(catalogue, "PKG_TEST_STAGE", "V1", "Stage");
    const plug = variant!.lines.find((l) => l.itemCode === "TEST_PLUG")!;
    const a = resolveQty(plug, variant!, {
      instanceId: "a", variantId: "V1",
      geometry: { areaSqft: 100, lengthRft: 10 },
      params: { counters: 6 },
    });
    const b = resolveQty(plug, variant!, {
      instanceId: "b", variantId: "V1",
      geometry: { areaSqft: 80, lengthRft: 8 },
      params: { counters: 4 },
    });
    expect(a.qty).toBe(6);
    expect(b.qty).toBe(4);
  });
});

describe("uncalibrated geometry is null, never zero", () => {
  it("PER_AREA with no scale omits the line instead of inventing a quantity", () => {
    const { variant } = variantFromTemplate(catalogue, "PKG_TEST_STAGE", "V1", "Stage");
    const boq = buildBoq(catalogue, [variant!], [{
      instanceId: "i1", variantId: "V1",
      geometry: instanceGeometryFromPx(120, 80, null),
      params: { counters: 1 },
    }]);
    expect(boq.lines.find((l) => l.itemCode === "TEST_PLATFORM")).toBeUndefined();
    expect(boq.findings.some((f) => f.code === "GEOMETRY_MISSING")).toBe(true);
    /* Count-param lines still resolve without geometry. */
    expect(boq.lines.find((l) => l.itemCode === "TEST_PLUG")?.qty).toBe(1);
  });

  it("defaultFootprintPx is a sketch size without scale, 10×8 ft with one", () => {
    expect(defaultFootprintPx(null)).toEqual({ widthPx: 120, heightPx: 80 });
    const sized = defaultFootprintPx({ mmPerPixel: 30.48 });
    expect(sized.widthPx).toBeCloseTo(100);
    expect(sized.heightPx).toBeCloseTo(80);
  });
});

describe("PER_FRONT_FACE is frontage × height, not footprint", () => {
  it("qty = qtyValue × lengthRft × height param", () => {
    const { variant } = variantFromTemplate(catalogue, "PKG_TEST_STAGE", "V1", "Stage");
    const fascia = variant!.lines.find((l) => l.itemCode === "TEST_FASCIA")!;
    expect(fascia.rule).toEqual({ kind: "PER_FRONT_FACE", param: "height_ft" });
    const r = resolveQty(fascia, variant!, {
      instanceId: "a", variantId: "V1",
      geometry: { areaSqft: 200, lengthRft: 19.7 },
      params: { height_ft: 8 },
    });
    expect(r.qty).toBeCloseTo(19.7 * 8);
    expect(r.findings).toEqual([]);
  });

  it("emits GEOMETRY_MISSING when frontage is null", () => {
    const { variant } = variantFromTemplate(catalogue, "PKG_TEST_STAGE", "V1", "Stage");
    const fascia = variant!.lines.find((l) => l.itemCode === "TEST_FASCIA")!;
    const r = resolveQty(fascia, variant!, {
      instanceId: "a", variantId: "V1",
      geometry: { areaSqft: 200, lengthRft: null },
      params: { height_ft: 8 },
    });
    expect(r.qty).toBeNull();
    expect(r.findings.some((f) => f.code === "GEOMETRY_MISSING")).toBe(true);
  });

  it("emits PARAM_MISSING when the height param is unset", () => {
    const { variant } = variantFromTemplate(catalogue, "PKG_TEST_STAGE", "V1", "Stage");
    const fascia = variant!.lines.find((l) => l.itemCode === "TEST_FASCIA")!;
    const r = resolveQty(fascia, variant!, {
      instanceId: "a", variantId: "V1",
      geometry: { areaSqft: 200, lengthRft: 20 },
      params: {},
    });
    expect(r.qty).toBeNull();
    expect(r.findings.some((f) => f.code === "PARAM_MISSING")).toBe(true);
  });
});

describe("PER_VOLUME is footprint × height in cubic metres, not FIXED 1 cbm", () => {
  it("qty = qtyValue × area (canonical) × height (canonical) / 1e9", () => {
    const { variant } = variantFromTemplate(catalogue, "AUTO_TEST_SCAFFOLD", "V1", "scaff");
    const line = variant!.lines.find((l) => l.itemCode === "TEST_SCAFFOLD")!;
    expect(line.rule).toEqual({ kind: "PER_VOLUME", param: "height_ft" });
    const r = resolveQty(line, variant!, {
      instanceId: "a", variantId: "V1",
      geometry: { areaSqft: 100, lengthRft: 10 },
      params: { height_ft: 8 },
    });
    const expected = (toSqMm(100, "sqft") * toMm(8, "ft")) / 1_000_000_000;
    expect(r.qty).toBeCloseTo(expected);
    expect(r.qty).toBeGreaterThan(20);
    expect(r.qty).toBeLessThan(25);
    expect(r.findings).toEqual([]);
  });

  it("emits GEOMETRY_MISSING when the footprint is null", () => {
    const { variant } = variantFromTemplate(catalogue, "AUTO_TEST_SCAFFOLD", "V1", "scaff");
    const line = variant!.lines.find((l) => l.itemCode === "TEST_SCAFFOLD")!;
    const r = resolveQty(line, variant!, {
      instanceId: "a", variantId: "V1",
      geometry: { areaSqft: null, lengthRft: 10 },
      params: { height_ft: 8 },
    });
    expect(r.qty).toBeNull();
    expect(r.findings.some((f) => f.code === "GEOMETRY_MISSING")).toBe(true);
  });

  it("defaults height_ft to 8, same as PER_FRONT_FACE", () => {
    const pkg = catalogue.packages.get("AUTO_TEST_SCAFFOLD")!;
    expect(defaultInstanceParams(pkg)).toEqual({ height_ft: 8 });
  });
});

describe("standalone Items-palette drops use a correct qty_rule, not a copied kit param", () => {
  it("AUTO_TEST_RAIL bills the drawn run, with the same defaults the place API applies", () => {
    const pkg = catalogue.packages.get("AUTO_TEST_RAIL")!;
    expect(pkg.lines[0]!.rule).toEqual({ kind: "PER_LENGTH", param: null });
    const { variant } = variantFromTemplate(catalogue, "AUTO_TEST_RAIL", "V1", "rail");
    const scale = { mmPerPixel: 25 };
    const geometry = instanceGeometryFromPx(
      (20 * 304.8) / scale.mmPerPixel,
      (2 * 304.8) / scale.mmPerPixel,
      scale,
    );
    const r = resolveQty(variant!.lines[0]!, variant!, {
      instanceId: "a", variantId: "V1",
      geometry,
      params: defaultInstanceParams(pkg),
    });
    expect(r.findings).toEqual([]);
    expect(r.qty).toBeCloseTo(20);
    expect(defaultInstanceParams(pkg)).toEqual({});
  });
});
