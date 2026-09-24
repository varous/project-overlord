/**
 * Aggregation: many instances → one BOQ.
 *
 * Quantities sum by item_code across every instance in the layout, which is why
 * placing six entry gates yields one barricade line of 6 × the per-gate run
 * rather than six lines a human has to add up.
 *
 * Provenance is kept per line — which instances contributed, and how much each
 * did — because the first question anyone asks a derived number is "where did
 * that come from?"
 */

import type { Catalogue, Item } from "./catalog.js";
import type { Finding } from "./findings.js";
import { resolveQty, type Instance, type Variant } from "./instances.js";
import type { ShowItem } from "./show-items.js";

export interface BoqContribution {
  readonly instanceId: string | null;
  readonly showItemId: string | null;
  readonly variantId: string | null;
  readonly variantName: string;
  readonly qty: number;
  /** Carried through so a fuel line can be derived per placement. */
  readonly runningHoursPerDay: number | null;
}

export interface BoqLine {
  readonly itemCode: string;
  readonly item: Item;
  readonly qty: number;
  readonly contributions: readonly BoqContribution[];
  /** Highest override among contributing lines; null when none set. */
  readonly overrideDays: number | null;
}

export interface Boq {
  readonly lines: readonly BoqLine[];
  readonly findings: readonly Finding[];
}

export function buildBoq(
  catalogue: Catalogue,
  variants: readonly Variant[],
  instances: readonly Instance[],
  showItems: readonly ShowItem[] = [],
): Boq {
  const findings: Finding[] = [];
  const byVariant = new Map(variants.map((v) => [v.variantId, v]));

  interface Acc { qty: number; contributions: BoqContribution[]; overrideDays: number | null }
  const acc = new Map<string, Acc>();

  for (const instance of instances) {
    const variant = byVariant.get(instance.variantId);
    if (!variant) {
      findings.push({
        severity: "error", code: "ITEM_UNKNOWN", instanceId: instance.instanceId,
        message: `Placement ${instance.instanceId} points at variant ${instance.variantId}, which does not exist.`,
      });
      continue;
    }

    for (const line of variant.lines) {
      if (!line.included) continue;

      const item = catalogue.items.get(line.itemCode);
      if (!item) {
        findings.push({
          severity: "error", code: "ITEM_UNKNOWN", itemCode: line.itemCode,
          message: `Variant "${variant.name}" references item ${line.itemCode}, which is not in the catalogue.`,
        });
        continue;
      }
      /*
       * Fuel is not part of laying out an event — the layout places generators.
       * A fuel line is only carried into the BOQ when this placement has been
       * given running hours; otherwise it is omitted, and we say so.
       * Power planning proper is a later, separate module.
       */
      if (item.qtyBasis === "CONSUMPTION_PER_HOUR") {
        const hours = instance.runningHoursPerDay ?? null;
        if (hours === null || hours <= 0) {
          findings.push({
            severity: "info",
            code: "FUEL_OMITTED",
            itemCode: item.code,
            instanceId: instance.instanceId,
            message:
              `${item.code} omitted: no running hours set for this generator placement. ` +
              `Set running hours on the placement to include fuel in the quotation.`,
          });
          continue;
        }
      }

      const { qty, findings: qtyFindings } = resolveQty(line, variant, instance);
      findings.push(...qtyFindings);
      /* Un-quantifiable (uncalibrated PER_AREA / missing param) is omitted,
         never zeroed. The export gate already blocks issuing these. */
      if (qty === null) continue;

      const existing = acc.get(line.itemCode) ?? { qty: 0, contributions: [], overrideDays: null };
      existing.qty += qty;
      existing.contributions.push({
        instanceId: instance.instanceId,
        showItemId: null,
        variantId: variant.variantId,
        variantName: variant.name,
        qty,
        runningHoursPerDay: instance.runningHoursPerDay ?? null,
      });
      if (line.overrideDays !== null) {
        existing.overrideDays = Math.max(existing.overrideDays ?? 0, line.overrideDays);
      }
      acc.set(line.itemCode, existing);
    }
  }

  for (const showItem of showItems) {
    const item = catalogue.items.get(showItem.itemCode);
    if (!item) {
      findings.push({
        severity: "error", code: "ITEM_UNKNOWN", itemCode: showItem.itemCode,
        showItemId: showItem.showItemId,
        message: `Show item ${showItem.showItemId} references ${showItem.itemCode}, which is not in the catalogue.`,
      });
      continue;
    }
    if (item.qtyBasis === "CONSUMPTION_PER_HOUR") {
      findings.push({
        severity: "info",
        code: "FUEL_OMITTED",
        itemCode: item.code,
        showItemId: showItem.showItemId,
        message:
          `${item.code} omitted: fuel is not a show-level line. Set running hours on a generator placement.`,
      });
      continue;
    }
    if (!Number.isFinite(showItem.qty) || showItem.qty <= 0) continue;

    const existing = acc.get(showItem.itemCode) ?? { qty: 0, contributions: [], overrideDays: null };
    existing.qty += showItem.qty;
    existing.contributions.push({
      instanceId: null,
      showItemId: showItem.showItemId,
      variantId: null,
      variantName: "Show",
      qty: showItem.qty,
      runningHoursPerDay: null,
    });
    acc.set(showItem.itemCode, existing);
  }

  const lines: BoqLine[] = [...acc.entries()]
    .map(([itemCode, a]) => ({
      itemCode,
      item: catalogue.items.get(itemCode)!,
      qty: a.qty,
      contributions: a.contributions,
      overrideDays: a.overrideDays,
    }))
    /* Section, then the master sheet's own order — so the BOQ reads the way the
       estimators' spreadsheet reads. */
    .sort((a, b) =>
      a.item.section === b.item.section
        ? a.item.sortOrder - b.item.sortOrder
        : sectionRank(a.item.section) - sectionRank(b.item.section));

  return { lines, findings };
}

function sectionRank(s: Item["section"]): number {
  return s === "VC" ? 0 : s === "OPS" ? 1 : 2;
}
