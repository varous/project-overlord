/**
 * Fuel in the BOQ — the "decision 2" rule from the deleted decisions suite,
 * re-pointed at the synthetic genset package.
 *
 * The rule lives in `src/boq.ts`: the layout places generators, not fuel. A
 * generator placement carries `runningHoursPerDay`; its fuel line is carried
 * into the BOQ only when that is set, and each placement is accounted for on
 * its own hours — never an averaged figure. Consumption itself is physics and
 * lives on the item (`consumptionLitresPerHour`), not on a rate.
 *
 * These tests assert the existing behaviour of `buildBoq` and `resolveQty`.
 */

import { describe, expect, it } from "vitest";
import { loadSynthetic } from "./fixtures/synthetic-bundle.js";
import { buildBoq } from "../src/boq.js";
import { variantFromTemplate, type Instance, type Variant } from "../src/instances.js";

const { catalogue } = loadSynthetic();

function gensetVariant(): Variant {
  const { variant } = variantFromTemplate(catalogue, "PKG_TEST_GENSET", "V1", "genset");
  if (!variant) throw new Error("PKG_TEST_GENSET is missing from the synthetic bundle");
  return variant;
}

function genset(instanceId: string, runningHoursPerDay: number | null): Instance {
  return {
    instanceId,
    variantId: "V1",
    geometry: { areaSqft: null, lengthRft: null },
    runningHoursPerDay,
  };
}

describe("fuel is placed with its generator, never on its own", () => {
  it("omits the fuel line and names the placement when a genset has no running hours", () => {
    const boq = buildBoq(catalogue, [gensetVariant()], [genset("g-none", null)]);

    expect(boq.lines.map((l) => l.itemCode)).not.toContain("TEST_GENFUEL");
    expect(boq.lines.map((l) => l.itemCode)).toContain("TEST_GENSET");

    const finding = boq.findings.find(
      (f) => f.code === "FUEL_OMITTED" && f.instanceId === "g-none",
    );
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("info");
    expect(finding!.itemCode).toBe("TEST_GENFUEL");
  });

  it("includes the fuel line once running hours are set, carrying the derived quantity", () => {
    const boq = buildBoq(catalogue, [gensetVariant()], [genset("g-hours", 8)]);

    const fuel = boq.lines.find((l) => l.itemCode === "TEST_GENFUEL");
    expect(fuel).toBeDefined();
    /* FIXED single drop: qty comes from the qty_rule, not from an averaged day. */
    expect(fuel!.qty).toBe(1);
    expect(fuel!.contributions).toHaveLength(1);
    expect(fuel!.contributions[0]!.instanceId).toBe("g-hours");
    expect(fuel!.contributions[0]!.runningHoursPerDay).toBe(8);
    /* Litres per running hour is physics on the item row: 1 × 12 l/hr × 8 h. */
    expect(fuel!.item.consumptionLitresPerHour).toBe(12);
    expect(catalogue.items.get("TEST_GENFUEL")!.consumptionLitresPerHour).toBe(12);
  });

  it("bills each genset on its own hours — the stage and backstage gensets differ", () => {
    const boq = buildBoq(
      catalogue,
      [gensetVariant()],
      [genset("stage", 6), genset("backstage", 14)],
    );

    const fuel = boq.lines.find((l) => l.itemCode === "TEST_GENFUEL")!;
    expect(fuel.contributions).toHaveLength(2);
    /* Per placement, not 2 gensets × an averaged 10 hours. */
    expect(fuel.contributions.map((c) => c.runningHoursPerDay).sort((a, b) => a! - b!)).toEqual([
      6, 14,
    ]);
    expect(fuel.contributions.map((c) => c.instanceId).sort()).toEqual(["backstage", "stage"]);
  });

  it("takes fuel from the genset that has hours and reports the one that does not", () => {
    const boq = buildBoq(
      catalogue,
      [gensetVariant()],
      [genset("with", 8), genset("without", null)],
    );

    const fuel = boq.lines.find((l) => l.itemCode === "TEST_GENFUEL")!;
    expect(fuel.contributions).toHaveLength(1);
    expect(fuel.contributions[0]!.instanceId).toBe("with");

    const omitted = boq.findings.find(
      (f) => f.code === "FUEL_OMITTED" && f.instanceId === "without",
    );
    expect(omitted).toBeDefined();

    /* Both generators are still on the BOQ. */
    expect(boq.lines.find((l) => l.itemCode === "TEST_GENSET")!.qty).toBe(2);
  });
});
