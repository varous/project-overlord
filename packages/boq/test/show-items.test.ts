import { describe, expect, it } from "vitest";
import { loadSynthetic } from "./fixtures/synthetic-bundle.js";
import { buildBoq } from "../src/boq.js";
import { geometryExportBlockers } from "../src/export-gate.js";
import { variantFromTemplate, type Instance } from "../src/instances.js";
import type { ShowItem } from "../src/show-items.js";

const { catalogue } = loadSynthetic();

const pest: ShowItem = { showItemId: "s1", itemCode: "TEST_PEST", qty: 2 };

describe("show-level items in the BOQ", () => {
  it("a show item alone produces one line", () => {
    const boq = buildBoq(catalogue, [], [], [pest]);
    expect(boq.lines).toHaveLength(1);
    expect(boq.lines[0]!.itemCode).toBe("TEST_PEST");
    expect(boq.lines[0]!.qty).toBe(2);
    expect(boq.lines[0]!.contributions).toEqual([
      {
        instanceId: null,
        showItemId: "s1",
        variantId: null,
        variantName: "Show",
        qty: 2,
        runningHoursPerDay: null,
      },
    ]);
  });

  it("a show item plus a placement of the same item_code aggregates into one line", () => {
    const { variant } = variantFromTemplate(catalogue, "AUTO_TEST_CHAIR", "V1", "Chair");
    expect(variant).toBeDefined();
    const instance: Instance = {
      instanceId: "chair-1",
      variantId: "V1",
      geometry: { areaSqft: null, lengthRft: null },
      params: {},
    };
    const extra: ShowItem = { showItemId: "s-chair", itemCode: "TEST_CHAIR", qty: 3 };
    const boq = buildBoq(catalogue, [variant!], [instance], [extra]);
    const line = boq.lines.find((l) => l.itemCode === "TEST_CHAIR");
    expect(line).toBeDefined();
    expect(line!.qty).toBe(4);
    expect(line!.contributions).toHaveLength(2);
    expect(line!.contributions.map((c) => c.instanceId ?? c.showItemId).sort()).toEqual([
      "chair-1",
      "s-chair",
    ]);
  });

  it("a show item on an uncalibrated layout does not block export", () => {
    const boq = buildBoq(catalogue, [], [], [pest]);
    expect(boq.lines).toHaveLength(1);
    const blockers = geometryExportBlockers({
      scale: null,
      lines: [{ itemCode: pest.itemCode, rule: { kind: "FIXED", param: null }, label: "Show" }],
    });
    expect(blockers).toEqual([]);
  });
});
