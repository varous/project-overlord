/**
 * Load the imported catalogue into the domain `Catalogue` the BOQ engine expects.
 */
import {
  parseQtyRule,
  type Catalogue,
  type DayCurve,
  type Item,
  type PackageItemFlag,
  type PackageTemplate,
  type Placement,
  type QtyBasis,
  type Section,
} from "@overlord/boq";
import { db } from "./db.js";

const SECTIONS = new Set<Section>(["VC", "OPS", "POWER"]);
const BASES = new Set<QtyBasis>([
  "AREA",
  "LENGTH",
  "VOLUME",
  "COUNT",
  "COUNT_PER_DAY",
  "CONSUMPTION_PER_HOUR",
]);
const PLACEMENTS = new Set<Placement>(["CANVAS", "SHOW", "PACKAGE_ONLY"]);

export async function loadCatalogueFromDb(): Promise<{
  catalogue: Catalogue;
  versionId: string;
  versionLabel: string;
} | null> {
  const version = await db.catalogueVersion.findFirst({
    orderBy: { importedAt: "desc" },
  });
  if (!version) return null;

  const [itemRows, curveRows, packageRows] = await Promise.all([
    db.item.findMany(),
    db.dayCurve.findMany(),
    db.packageTemplate.findMany({ include: { lines: true } }),
  ]);

  const items = new Map<string, Item>();
  for (const row of itemRows) {
    if (!SECTIONS.has(row.section as Section) || !BASES.has(row.qtyBasis as QtyBasis)) continue;
    items.set(row.code, {
      code: row.code,
      name: row.name,
      category: row.category,
      section: row.section as Section,
      unit: row.unit,
      qtyBasis: row.qtyBasis as QtyBasis,
      dayCurve: row.dayCurveId,
      tags: row.tags,
      linkedRateItem: row.linkedRateItem,
      consumptionLitresPerHour: row.consumptionLitresPerHour,
      powerSupplyKva: row.powerSupplyKva,
      notes: row.notes,
      sortOrder: row.sortOrder,
      placement: PLACEMENTS.has(row.placement as Placement)
        ? (row.placement as Placement)
        : "CANVAS",
    });
  }

  const curves = new Map<string, DayCurve>();
  for (const row of curveRows) {
    const raw = (row.table ?? {}) as Record<string, number>;
    const table: Record<number, number> = {};
    for (const [k, v] of Object.entries(raw)) table[Number(k)] = v;
    curves.set(row.id, { id: row.id, table });
  }

  const packages = new Map<string, PackageTemplate>();
  for (const row of packageRows) {
    packages.set(row.packageId, {
      packageId: row.packageId,
      name: row.name,
      description: row.description,
      params: row.params,
      auto: row.auto,
      lines: row.lines.map((l) => ({
        packageId: row.packageId,
        itemCode: l.itemCode,
        rule: parseQtyRule(l.qtyRule),
        qtyValue: l.qtyValue,
        flag: l.flag as PackageItemFlag,
      })),
    });
  }

  return {
    catalogue: { items, curves, packages, version: version.label },
    versionId: version.id,
    versionLabel: version.label,
  };
}
