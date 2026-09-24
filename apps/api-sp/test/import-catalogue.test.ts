import { afterAll, describe, expect, it } from "vitest";
import { loadBundle, type Bundle } from "@overlord/boq";
import { db } from "../src/lib/db.js";
import { writeCatalogue } from "../src/lib/import-catalogue.js";

const CODE = "ZZ_IDEM_ITEM";
const PKG = "PKG_IDEM";
const AUTO = `AUTO_${CODE}`;

const FULL: Record<string, number> = {};
for (let d = 1; d <= 14; d++) FULL[String(d)] = d;

function bundle(name: string): Bundle {
  return {
    items: [
      {
        code: CODE,
        name,
        category: "Idempotency",
        section: "VC",
        unit: "nos",
        qty_basis: "COUNT",
        day_curve: "FULL",
        tags: ["idempotency fixture"],
        linked_rate_item: null,
        power_supply_kva: null,
        notes: null,
        sort_order: 9999,
        placement: "CANVAS",
      },
    ],
    day_curves: { FULL },
    packages: [{ package_id: PKG, name: "Idem pack", description: null, params: [] }],
    package_items: [
      { package_id: PKG, item_code: CODE, qty_rule: "FIXED", qty_value: 1, flag: "MANDATORY" },
    ],
  };
}

const silent = { log() {}, warn() {} };

async function counts() {
  return {
    items: await db.item.count({ where: { code: CODE } }),
    packages: await db.packageTemplate.count({ where: { packageId: { in: [PKG, AUTO] } } }),
    lines: await db.packageItem.count({ where: { packageId: { in: [PKG, AUTO] } } }),
  };
}

describe("writeCatalogue is idempotent", () => {
  afterAll(async () => {
    await db.packageItem.deleteMany({ where: { packageId: { in: [PKG, AUTO] } } });
    await db.packageTemplate.deleteMany({ where: { packageId: { in: [PKG, AUTO] } } });
    await db.item.deleteMany({ where: { code: CODE } });
    await db.catalogueVersion.deleteMany({ where: { label: { in: ["idem_v1", "idem_v2"] } } });
    await db.$disconnect();
  });

  it("re-importing the same bundle does not duplicate or fail unique constraints", async () => {
    const loaded = loadBundle(bundle("Alpha"), "idem_v1");
    expect(loaded.findings.filter((f) => f.severity === "error")).toEqual([]);

    const first = await writeCatalogue(db, loaded.catalogue, loaded.findings, "idem_v1", silent, {
      pruneStaleAutos: false,
    });
    const afterFirst = await counts();
    expect(afterFirst).toEqual({ items: 1, packages: 2, lines: 2 });
    expect(first).toMatchObject({ items: 1, version: "idem_v1" });

    const second = await writeCatalogue(db, loaded.catalogue, loaded.findings, "idem_v1", silent, {
      pruneStaleAutos: false,
    });
    expect(second).toEqual(first);
    expect(await counts()).toEqual(afterFirst);
  });

  it("a VERSION bump updates the item in place rather than inserting a second row", async () => {
    const v2 = loadBundle(bundle("Beta"), "idem_v2");
    await writeCatalogue(db, v2.catalogue, v2.findings, "idem_v2", silent, { pruneStaleAutos: false });

    expect(await counts()).toEqual({ items: 1, packages: 2, lines: 2 });
    const item = await db.item.findUnique({ where: { code: CODE } });
    expect(item?.name).toBe("Beta");
    const versions = await db.catalogueVersion.findMany({
      where: { label: { in: ["idem_v1", "idem_v2"] } },
      select: { label: true },
    });
    expect(versions.map((v) => v.label).sort()).toEqual(["idem_v1", "idem_v2"]);
  });
});
