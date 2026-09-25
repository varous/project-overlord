import { describe, expect, it } from "vitest";
import type { BoqFinding, BoqLine } from "./api.js";
import {
  CSV_HEADER,
  contributionSummary,
  csvFilename,
  groupBySection,
  orderFindings,
  toCsv,
} from "./boq-panel.js";

const PLATFORM: BoqLine = {
  itemCode: "TEST_PLATFORM", name: "Platform deck", unit: "sqft", qtyBasis: "AREA",
  section: "VC", category: "structure", qty: 120,
  contributions: [{ instanceId: "i3", showItemId: null, variantName: "stage kit", qty: 120 }],
};

const GENSET: BoqLine = {
  itemCode: "TEST_GENSET", name: "Generator unit", unit: "nos", qtyBasis: "COUNT",
  section: "POWER", category: "power", qty: 2,
  contributions: [
    { instanceId: "i1", showItemId: null, variantName: "stage genset", qty: 1 },
    { instanceId: "i2", showItemId: null, variantName: "backstage genset", qty: 1 },
  ],
};

/* buildBoq orders lines by section, so the VC line comes first. */
const LINES: BoqLine[] = [PLATFORM, GENSET];

describe("groupBySection", () => {
  it("groups by section in VC → OPS → POWER order and omits empty sections", () => {
    const groups = groupBySection(LINES);
    expect(groups.map((g) => g.section)).toEqual(["VC", "POWER"]);
    expect(groups.map((g) => g.label)).toEqual(["Venue Construction", "Power"]);
    expect(groups[0]!.lines.map((l) => l.itemCode)).toEqual(["TEST_PLATFORM"]);
  });
});

describe("orderFindings", () => {
  it("sorts errors before warnings before info", () => {
    const findings: BoqFinding[] = [
      { severity: "info", code: "FUEL_OMITTED", message: "info" },
      { severity: "error", code: "ITEM_UNKNOWN", message: "error" },
      { severity: "warning", code: "GEOMETRY_MISSING", message: "warning" },
    ];
    expect(orderFindings(findings).map((f) => f.severity)).toEqual(["error", "warning", "info"]);
  });
});

describe("toCsv", () => {
  it("has the exact header row and one row per line", () => {
    const csv = toCsv(LINES);
    const rows = csv.split("\n");
    expect(rows[0]).toBe(CSV_HEADER);
    expect(CSV_HEADER).toBe("Section,Category,Code,Item,Qty,Unit,Basis,Contributions");
    expect(rows).toHaveLength(1 + LINES.length);
    expect(rows[1]).toContain("Venue Construction,structure,TEST_PLATFORM,Platform deck,120,sqft,AREA");
  });

  it("summarises contributions per line", () => {
    expect(contributionSummary(GENSET)).toBe("stage genset×1; backstage genset×1");
  });
});

describe("csvFilename", () => {
  it("is <project name>-boq-<yyyy-mm-dd>.csv", () => {
    expect(csvFilename("Diwali / Night", new Date(2026, 8, 25))).toBe("Diwali - Night-boq-2026-09-25.csv");
  });
});
