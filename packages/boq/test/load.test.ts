import { describe, expect, it } from "vitest";
import { loadSynthetic, SYNTHETIC_VERSION } from "./fixtures/synthetic-bundle.js";
import { loadBundle, type Bundle } from "../src/load.js";

const { catalogue, findings } = loadSynthetic();

const CANVAS_CODES = [
  "TEST_CABLE",
  "TEST_CHAIR",
  "TEST_FASCIA",
  "TEST_LED",
  "TEST_LIGHT",
  "TEST_PLATFORM",
  "TEST_PLUG",
  "TEST_RAIL",
  "TEST_SCAFFOLD",
];

describe("the synthetic bundle loads", () => {
  it("has the documented shape, with no rate collection at all", () => {
    expect(catalogue.items.size).toBe(13);
    expect(catalogue.curves.size).toBe(2);
    expect(catalogue.version).toBe(SYNTHETIC_VERSION);
    expect("rates" in catalogue).toBe(false);

    const hand = [...catalogue.packages.values()].filter((p) => !p.auto);
    expect(hand.map((p) => p.packageId).sort()).toEqual([
      "PKG_TEST_GENSET",
      "PKG_TEST_LIGHTING",
      "PKG_TEST_STAGE",
    ]);

    const canvas = [...catalogue.items.values()].filter((i) => i.placement === "CANVAS");
    const show = [...catalogue.items.values()].filter((i) => i.placement === "SHOW");
    const kitOnly = [...catalogue.items.values()].filter((i) => i.placement === "PACKAGE_ONLY");
    expect(canvas.map((i) => i.code).sort()).toEqual(CANVAS_CODES);
    expect(show.map((i) => i.code).sort()).toEqual(["TEST_CREW", "TEST_PEST"]);
    expect(kitOnly.map((i) => i.code).sort()).toEqual(["TEST_GENFUEL", "TEST_GENSET"]);
    expect(canvas.length + show.length + kitOnly.length).toBe(13);

    expect(catalogue.packages.size).toBe(3 + canvas.length);
    for (const item of canvas) {
      const pkg = catalogue.packages.get(`AUTO_${item.code}`);
      expect(pkg, `${item.code} missing auto package`).toBeDefined();
      expect(pkg!.auto).toBe(true);
      expect(pkg!.lines).toHaveLength(1);
      expect(pkg!.lines[0]!.itemCode).toBe(item.code);
      expect(pkg!.lines[0]!.flag).toBe("MANDATORY");
    }
    expect(catalogue.packages.has("AUTO_TEST_GENFUEL")).toBe(false);
    expect(catalogue.packages.has("AUTO_TEST_GENSET")).toBe(false);
  });

  it("has no duplicate codes, orphan FKs, or unexpected errors", () => {
    const fatal = findings.filter(
      (f) => f.severity === "error" && f.code !== "RULE_BASIS_MISMATCH" && f.code !== "PARAM_MISSING",
    );
    expect(fatal).toEqual([]);
  });

  it("every curve covers days 1..14", () => {
    for (const curve of catalogue.curves.values()) {
      for (let d = 1; d <= 14; d++) expect(curve.table[d], `${curve.id} day ${d}`).toBeDefined();
    }
  });

  it("reads the day-curve shape from data, not code", () => {
    expect(catalogue.curves.get("FULL")!.table[5]).toBe(5);
    expect(catalogue.curves.get("ONCE")!.table[5]).toBe(1);
  });

  it("stores fuel consumption as litres per hour on the item, never as money", () => {
    const fuel = catalogue.items.get("TEST_GENFUEL")!;
    expect(fuel.qtyBasis).toBe("CONSUMPTION_PER_HOUR");
    expect(fuel.consumptionLitresPerHour).toBe(12);
    expect(fuel.linkedRateItem).toBeNull();
    /* No other item carries a consumption figure. */
    const withConsumption = [...catalogue.items.values()]
      .filter((i) => i.consumptionLitresPerHour !== null)
      .map((i) => i.code);
    expect(withConsumption).toEqual(["TEST_GENFUEL"]);
  });

  it("covers every remaining QtyBasis", () => {
    const bases = [...new Set([...catalogue.items.values()].map((i) => i.qtyBasis))].sort();
    expect(bases).toEqual([
      "AREA", "CONSUMPTION_PER_HOUR", "COUNT", "COUNT_PER_DAY", "LENGTH", "VOLUME",
    ]);
  });

  it("covers every QtyRuleKind across the hand packages", () => {
    const kinds = new Set<string>();
    for (const pkg of catalogue.packages.values()) {
      if (pkg.auto) continue;
      for (const line of pkg.lines) kinds.add(line.rule.kind);
    }
    expect([...kinds].sort()).toEqual([
      "FIXED", "PER_AREA", "PER_COUNT_PARAM", "PER_FRONT_FACE", "PER_LENGTH", "PER_VOLUME",
    ]);
  });

  it("covers every package flag", () => {
    const flags = new Set<string>();
    for (const pkg of catalogue.packages.values()) {
      if (pkg.auto) continue;
      for (const line of pkg.lines) flags.add(line.flag);
    }
    expect([...flags].sort()).toEqual(["DEFAULT_ON", "MANDATORY", "OPTIONAL"]);
  });

  it("declares the PER_COUNT_PARAM params on their packages", () => {
    expect(catalogue.packages.get("PKG_TEST_STAGE")!.params).toContain("counters");
    expect(catalogue.packages.get("PKG_TEST_LIGHTING")!.params).toContain("lanes");
  });

  it("keeps tags as a search corpus", () => {
    const total = [...catalogue.items.values()].reduce((n, i) => n + i.tags.length, 0);
    expect(total).toBe(25);
    expect(catalogue.items.get("TEST_PLATFORM")!.tags).toContain("deck");
  });

  it("makes the genset hire PACKAGE_ONLY so it cannot land without fuel", () => {
    const hire = catalogue.items.get("TEST_GENSET")!;
    expect(hire.placement).toBe("PACKAGE_ONLY");
    expect(catalogue.packages.has("AUTO_TEST_GENSET")).toBe(false);
  });

  it("puts the fuel in exactly one package, beside its MANDATORY hire partner", () => {
    const pkgs = [...catalogue.packages.values()].filter((p) =>
      p.lines.some((l) => l.itemCode === "TEST_GENFUEL"),
    );
    expect(pkgs).toHaveLength(1);
    const hire = pkgs[0]!.lines.find((l) => l.itemCode === "TEST_GENSET");
    expect(hire).toBeDefined();
    expect(hire!.flag).toBe("MANDATORY");
    expect(pkgs[0]!.lines.find((l) => l.itemCode === "TEST_GENFUEL")!.flag).toBe("MANDATORY");
  });

  it("does not let a CANVAS item sit MANDATORY next to a PACKAGE_ONLY partner", () => {
    expect(findings.filter((f) => f.code === "CANVAS_OMITS_KIT")).toEqual([]);
  });

  it("does not leave a PACKAGE_ONLY item outside every package", () => {
    expect(findings.filter((f) => f.code === "PACKAGE_ONLY_ORPHAN")).toEqual([]);
  });

  it("auto-packages VOLUME scaff as PER_VOLUME:height_ft, never FIXED 1 cbm", () => {
    const pkg = catalogue.packages.get("AUTO_TEST_SCAFFOLD")!;
    expect(pkg.lines[0]!.rule).toEqual({ kind: "PER_VOLUME", param: "height_ft" });
    expect(pkg.params).toEqual(["height_ft"]);
  });

  it("auto-packages vertical masking as PER_FRONT_FACE, not footprint PER_AREA", () => {
    const pkg = catalogue.packages.get("AUTO_TEST_FASCIA")!;
    expect(pkg.lines[0]!.rule).toEqual({ kind: "PER_FRONT_FACE", param: "height_ft" });
    expect(pkg.params).toEqual(["height_ft"]);
  });

  it("does not flag two geometry takeoffs when the kit and the auto rule agree", () => {
    expect(findings.filter((f) => f.code === "QTY_RULE_CONFLICT")).toEqual([]);
    expect(catalogue.packages.get("AUTO_TEST_RAIL")!.lines[0]!.rule.kind).toBe("PER_LENGTH");
    expect(catalogue.packages.get("AUTO_TEST_CHAIR")!.lines[0]!.rule.kind).toBe("FIXED");
    expect(catalogue.packages.get("AUTO_TEST_PLATFORM")!.lines[0]!.rule.kind).toBe("PER_AREA");
  });
});

function fullCurve(): Record<string, number> {
  const table: Record<string, number> = {};
  for (let d = 1; d <= 14; d++) table[String(d)] = d;
  return table;
}

function itemRow(over: Partial<Bundle["items"][number]> & { code: string }): Bundle["items"][number] {
  return {
    name: over.code, category: "t", section: "OPS", unit: "nos",
    qty_basis: "COUNT", day_curve: "FULL", tags: [],
    linked_rate_item: null, power_supply_kva: null, notes: null, sort_order: 1,
    placement: "CANVAS",
    ...over,
  };
}

describe("PACKAGE_ONLY reachability", () => {
  it("errors when a PACKAGE_ONLY item belongs to no package", () => {
    const { findings } = loadBundle({
      items: [itemRow({ code: "ORPHAN", placement: "PACKAGE_ONLY" })],
      day_curves: { FULL: fullCurve() },
      packages: [],
      package_items: [],
    }, "t");
    expect(findings.some((f) => f.code === "PACKAGE_ONLY_ORPHAN" && f.itemCode === "ORPHAN")).toBe(true);
  });

  it("warns when a CONSUMPTION_PER_HOUR item carries no litres-per-hour figure", () => {
    const { findings } = loadBundle({
      items: [itemRow({
        code: "FUEL", placement: "PACKAGE_ONLY",
        qty_basis: "CONSUMPTION_PER_HOUR", unit: "l/hr",
      })],
      day_curves: { FULL: fullCurve() },
      packages: [],
      package_items: [],
    }, "t");
    expect(findings.some((f) => f.code === "CONSUMPTION_MISSING" && f.itemCode === "FUEL")).toBe(true);
  });

  it("errors when a CANVAS item is the mandatory partner of a PACKAGE_ONLY line", () => {
    const { findings } = loadBundle({
      items: [
        itemRow({ code: "HIRE", placement: "CANVAS" }),
        itemRow({ code: "FUEL", placement: "PACKAGE_ONLY" }),
      ],
      day_curves: { FULL: fullCurve() },
      packages: [{ package_id: "PKG_X", name: "X", params: [] }],
      package_items: [
        { package_id: "PKG_X", item_code: "HIRE", qty_rule: "FIXED", qty_value: 1, flag: "MANDATORY" },
        { package_id: "PKG_X", item_code: "FUEL", qty_rule: "FIXED", qty_value: 1, flag: "MANDATORY" },
      ],
    }, "t");
    expect(findings.some((f) => f.code === "CANVAS_OMITS_KIT" && f.itemCode === "HIRE")).toBe(true);
  });

  it("errors when a hand package and the auto package use different qty_rule kinds", () => {
    const { findings } = loadBundle({
      items: [itemRow({
        code: "FACE", placement: "CANVAS",
        qty_basis: "AREA", unit: "sqft",
      })],
      day_curves: { FULL: fullCurve() },
      packages: [{ package_id: "PKG_X", name: "X", params: ["height_ft"] }],
      package_items: [{
        package_id: "PKG_X", item_code: "FACE",
        qty_rule: "PER_FRONT_FACE:height_ft", qty_value: 1, flag: "MANDATORY",
      }],
    }, "t");
    expect(findings.some((f) => f.code === "QTY_RULE_CONFLICT" && f.itemCode === "FACE")).toBe(true);
  });
});
