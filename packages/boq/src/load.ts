/**
 * Parse a catalogue bundle into a Catalogue.
 *
 * This lives in `boq` rather than `api-sp` on purpose: the bundle format IS the
 * data contract, so the parser and its validation belong with the rules that
 * depend on them, and both are testable without a database.
 *
 * Money is never part of the bundle: rates live in QuoteOS. The one physical
 * quantity the engine reads off an item row is fuel burn
 * (`consumptionLitresPerHour`, litres per running hour).
 *
 * Import is idempotent by code — re-importing a newer bundle upserts. That
 * property is a property of the DB writer in `api-sp`; this function is pure and
 * simply produces the same Catalogue for the same bytes.
 */

import {
  autoPackageId, parseQtyRule, qtyRuleForCanvasItem, PLACEMENTS,
  type Catalogue, type DayCurve, type Item, type PackageItem,
  type PackageTemplate, type Placement, type QtyBasis,
  type Section,
} from "./catalog.js";
import type { Finding } from "./findings.js";
import { isGeometryDependentQtyRule } from "./export-gate.js";

/* Raw shapes, exactly as they appear in the bundle's JSON. */
interface RawItem {
  code: string; name: string; category: string; section: string; unit: string;
  qty_basis: string; day_curve: string; tags: string[];
  linked_rate_item: string | null;
  consumption_litres_per_hour?: number | null;
  power_supply_kva: number | null;
  notes: string | null; sort_order: number;
  placement: string;
  auto_qty_rule?: string | null;
}
interface RawPackage { package_id: string; name: string; description?: string | null; params?: string[] }
interface RawPackageItem { package_id: string; item_code: string; qty_rule: string; qty_value: number; flag: string }

export interface Bundle {
  items: RawItem[];
  day_curves: Record<string, Record<string, number>>;
  packages: RawPackage[];
  package_items: RawPackageItem[];
}

/** Which qty_rule kinds are legal for which item qty_basis. */
const RULE_ALLOWS: Record<string, ReadonlySet<QtyBasis>> = {
  FIXED: new Set(["COUNT", "COUNT_PER_DAY", "VOLUME", "CONSUMPTION_PER_HOUR"]),
  PER_AREA: new Set(["AREA"]),
  PER_LENGTH: new Set(["LENGTH"]),
  PER_COUNT_PARAM: new Set(["COUNT", "COUNT_PER_DAY"]),
  PER_FRONT_FACE: new Set(["AREA"]),
  PER_VOLUME: new Set(["VOLUME"]),
};

/** The unit each basis must carry. Verified 1:1 in the v1 bundle. */
const BASIS_UNITS: Record<QtyBasis, ReadonlySet<string>> = {
  AREA: new Set(["sqft"]),
  LENGTH: new Set(["rft"]),
  VOLUME: new Set(["cbm"]),
  COUNT: new Set(["nos"]),
  COUNT_PER_DAY: new Set(["nos/duty", "day"]),
  CONSUMPTION_PER_HOUR: new Set(["l/hr"]),
};

export function loadBundle(
  bundle: Bundle,
  version: string,
): { catalogue: Catalogue; findings: Finding[] } {
  const findings: Finding[] = [];

  /* --- curves --- */
  const curves = new Map<string, DayCurve>();
  for (const [id, table] of Object.entries(bundle.day_curves)) {
    const numeric: Record<number, number> = {};
    for (const [day, value] of Object.entries(table)) numeric[Number(day)] = value;
    for (let d = 1; d <= 14; d++) {
      if (numeric[d] === undefined) {
        findings.push({
          severity: "warning", code: "CURVE_DAY_MISSING",
          message: `Curve "${id}" has no value for day ${d}.`,
        });
      }
    }
    curves.set(id, { id, table: numeric });
  }

  /* --- items --- */
  const items = new Map<string, Item>();
  const autoQtyByCode = new Map<string, string>();
  for (const r of bundle.items) {
    if (items.has(r.code)) {
      findings.push({
        severity: "error", code: "ITEM_UNKNOWN", itemCode: r.code,
        message: `Duplicate item code "${r.code}" in the bundle. Codes are the primary key and must be unique.`,
      });
      continue;
    }
    if (!PLACEMENTS.includes(r.placement as Placement)) {
      findings.push({
        severity: "error", code: "PLACEMENT_INVALID", itemCode: r.code,
        message:
          `Item ${r.code} has placement "${r.placement ?? ""}"; expected CANVAS, SHOW, or PACKAGE_ONLY.`,
      });
      continue;
    }

    const consumption = r.consumption_litres_per_hour ?? null;
    if (
      consumption !== null
      && (typeof consumption !== "number" || !Number.isFinite(consumption) || consumption < 0)
    ) {
      findings.push({
        severity: "error", code: "CONSUMPTION_MISSING", itemCode: r.code,
        message: `Item ${r.code} has a non-finite or negative consumption_litres_per_hour.`,
      });
      continue;
    }

    const item: Item = {
      code: r.code,
      name: r.name,
      category: r.category,
      section: r.section as Section,
      unit: r.unit,
      qtyBasis: r.qty_basis as QtyBasis,
      dayCurve: r.day_curve,
      tags: r.tags ?? [],
      linkedRateItem: r.linked_rate_item ?? null,
      consumptionLitresPerHour: consumption,
      powerSupplyKva: r.power_supply_kva ?? null,
      notes: r.notes ?? null,
      sortOrder: r.sort_order,
      placement: r.placement as Placement,
    };
    if (!curves.has(item.dayCurve)) {
      findings.push({
        severity: "error", code: "CURVE_MISSING", itemCode: item.code,
        message: `Item ${item.code} references unknown day curve "${item.dayCurve}".`,
      });
    }
    const expected = BASIS_UNITS[item.qtyBasis];
    if (expected && !expected.has(item.unit)) {
      findings.push({
        severity: "warning", code: "RULE_BASIS_MISMATCH", itemCode: item.code,
        message:
          `Item ${item.code} has qty_basis ${item.qtyBasis} but unit "${item.unit}"; ` +
          `expected one of ${[...expected].join(", ")}.`,
      });
    }
    /* Fuel burn is physics and is carried on the item row, not in a rate row. */
    if (item.qtyBasis === "CONSUMPTION_PER_HOUR" && item.consumptionLitresPerHour === null) {
      findings.push({
        severity: "warning", code: "CONSUMPTION_MISSING", itemCode: item.code,
        message:
          `Item ${item.code} is CONSUMPTION_PER_HOUR but carries no ` +
          `consumption_litres_per_hour. Its fuel line cannot be quantified.`,
      });
    }
    items.set(item.code, item);
    if (r.auto_qty_rule) autoQtyByCode.set(item.code, r.auto_qty_rule);
  }

  /* linked_rate_item must resolve */
  for (const item of items.values()) {
    if (item.linkedRateItem && !items.has(item.linkedRateItem)) {
      findings.push({
        severity: "error", code: "FUEL_LINK_MISSING", itemCode: item.code,
        message: `Item ${item.code} links to rate item "${item.linkedRateItem}", which does not exist.`,
      });
    }
  }

  /* --- packages --- */
  const linesByPackage = new Map<string, PackageItem[]>();
  for (const r of bundle.package_items) {
    let rule;
    try {
      rule = parseQtyRule(r.qty_rule);
    } catch (err) {
      findings.push({
        severity: "error", code: "RULE_BASIS_MISMATCH",
        itemCode: r.item_code, packageId: r.package_id,
        message: (err as Error).message,
      });
      continue;
    }
    const item = items.get(r.item_code);
    if (!item) {
      findings.push({
        severity: "error", code: "ITEM_UNKNOWN", itemCode: r.item_code, packageId: r.package_id,
        message: `Package ${r.package_id} references unknown item "${r.item_code}".`,
      });
      continue;
    }
    const allowed = RULE_ALLOWS[rule.kind];
    if (allowed && !allowed.has(item.qtyBasis)) {
      findings.push({
        severity: "warning", code: "RULE_BASIS_MISMATCH",
        itemCode: r.item_code, packageId: r.package_id,
        message:
          `${r.package_id} uses ${r.qty_rule} for ${r.item_code}, but the item's qty_basis is ` +
          `${item.qtyBasis} (unit "${item.unit}"). One of the two is wrong.`,
      });
    }
    const list = linesByPackage.get(r.package_id) ?? [];
    list.push({
      packageId: r.package_id, itemCode: r.item_code,
      rule, qtyValue: r.qty_value, flag: r.flag as PackageItem["flag"],
    });
    linesByPackage.set(r.package_id, list);
  }

  const packages = new Map<string, PackageTemplate>();
  for (const p of bundle.packages) {
    const params = p.params ?? [];
    const lines = linesByPackage.get(p.package_id) ?? [];
    for (const l of lines) {
      if (
        (l.rule.kind === "PER_COUNT_PARAM"
          || l.rule.kind === "PER_FRONT_FACE"
          || l.rule.kind === "PER_VOLUME")
        && l.rule.param && !params.includes(l.rule.param)
      ) {
        findings.push({
          severity: "error", code: "PARAM_MISSING",
          itemCode: l.itemCode, packageId: p.package_id,
          message:
            `${p.package_id} line ${l.itemCode} needs parameter "${l.rule.param}", ` +
            `but the package declares only [${params.join(", ")}].`,
        });
      }
    }
    packages.set(p.package_id, {
      packageId: p.package_id,
      name: p.name,
      description: p.description ?? null,
      params,
      lines,
      auto: false,
    });
  }

  /* Single-item templates for every CANVAS item — one code path
     (Template → Variant → Instance). Generated here so domain tests against
     the real bundle see them; import persists them. */
  for (const item of items.values()) {
    if (item.placement !== "CANVAS") continue;
    let rule;
    try {
      rule = qtyRuleForCanvasItem(item.qtyBasis, autoQtyByCode.get(item.code));
    } catch (err) {
      findings.push({
        severity: "error", code: "PLACEMENT_INVALID", itemCode: item.code,
        message: (err as Error).message,
      });
      continue;
    }
    if (!rule) {
      findings.push({
        severity: "error", code: "PLACEMENT_INVALID", itemCode: item.code,
        message:
          `${item.code} is CANVAS but qty_basis ${item.qtyBasis} cannot be auto-packaged.`,
      });
      continue;
    }
    const allowed = RULE_ALLOWS[rule.kind];
    if (allowed && !allowed.has(item.qtyBasis)) {
      findings.push({
        severity: "warning", code: "RULE_BASIS_MISMATCH", itemCode: item.code,
        message:
          `${item.code} auto qty_rule ${rule.kind} is not legal on qty_basis ${item.qtyBasis}.`,
      });
    }
    const packageId = autoPackageId(item.code);
    if (packages.has(packageId)) {
      findings.push({
        severity: "error", code: "ITEM_UNKNOWN", itemCode: item.code, packageId,
        message: `Auto package id ${packageId} collides with a hand-authored template.`,
      });
      continue;
    }
    const params = rule.param ? [rule.param] : [];
    packages.set(packageId, {
      packageId,
      name: item.name,
      description: null,
      params,
      auto: true,
      lines: [{
        packageId, itemCode: item.code, rule, qtyValue: 1, flag: "MANDATORY",
      }],
    });
  }

  /* PACKAGE_ONLY items must be reachable as a kit line (fuel follows its genset). */
  const inPackage = new Set<string>();
  for (const pkg of packages.values()) {
    for (const line of pkg.lines) inPackage.add(line.itemCode);
  }
  for (const item of items.values()) {
    if (item.placement !== "PACKAGE_ONLY") continue;
    if (inPackage.has(item.code)) continue;
    findings.push({
      severity: "error", code: "PACKAGE_ONLY_ORPHAN", itemCode: item.code,
      message:
        `${item.code} is PACKAGE_ONLY but belongs to no package — it cannot reach a BOQ.`,
    });
  }

  /* A CANVAS MANDATORY line in the same kit as a PACKAGE_ONLY MANDATORY line
     would be auto-packaged alone and omit the partner (genset hire without fuel). */
  for (const pkg of packages.values()) {
    const mandatory = pkg.lines.filter((l) => l.flag === "MANDATORY");
    const kitPartners = mandatory
      .filter((l) => items.get(l.itemCode)?.placement === "PACKAGE_ONLY")
      .map((l) => l.itemCode);
    if (kitPartners.length === 0) continue;
    for (const line of mandatory) {
      const partner = items.get(line.itemCode);
      if (partner?.placement !== "CANVAS") continue;
      findings.push({
        severity: "error", code: "CANVAS_OMITS_KIT",
        itemCode: partner.code, packageId: pkg.packageId,
        message:
          `${partner.code} is CANVAS and MANDATORY in ${pkg.packageId} alongside ` +
          `PACKAGE_ONLY ${kitPartners.join(", ")}. A standalone placement would omit the kit partner.`,
      });
    }
  }

  /* Two geometry takeoff formulas on the same item (PER_AREA vs PER_FRONT_FACE)
     aggregate into one BOQ line with no warning. Kit PER_COUNT_PARAM vs a
     standalone FIXED/PER_LENGTH is a different claim — the auto rule must be
     correct for an Items-palette drop, not copied from the kit. */
  for (const item of items.values()) {
    const auto = packages.get(autoPackageId(item.code));
    if (!auto) continue;
    const autoKind = auto.lines[0]?.rule.kind;
    if (!autoKind || !isGeometryDependentQtyRule(autoKind)) continue;
    for (const pkg of packages.values()) {
      if (pkg.auto) continue;
      for (const line of pkg.lines) {
        if (line.itemCode !== item.code) continue;
        if (!isGeometryDependentQtyRule(line.rule.kind)) continue;
        if (line.rule.kind === autoKind) continue;
        findings.push({
          severity: "error", code: "QTY_RULE_CONFLICT",
          itemCode: item.code, packageId: pkg.packageId,
          message:
            `${item.code} uses ${line.rule.kind} in ${pkg.packageId} but ${autoKind} ` +
            `in ${auto.packageId}. Both are geometry takeoffs that aggregate into one ` +
            `BOQ line — the quantity would depend on which palette was used.`,
        });
      }
    }
  }

  return { catalogue: { items, curves, packages, version }, findings };
}
