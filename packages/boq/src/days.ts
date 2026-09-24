/**
 * Billed days.
 *
 * The whole point: billed days is a FUNCTION of declared show days, and the
 * function differs per item type. `FULL` is linear (manpower, genset hire),
 * `ONCE` is flat 1 (consumables), and day-curves `VC` / `RENT` / `PWR` are
 * sub-linear market curves — day-curve `VC` bills 1 day for a 1–3 day show,
 * then 1.5 at four days.
 *
 * The curves are DATA, editable by admins, and extensible by adding rows. There
 * is deliberately no curve arithmetic anywhere in this file: we look values up.
 * If you find yourself writing `if (curve === "VC")`, stop. (`VC` here is the
 * day-curve id, not Venue Construction.)
 */

import type { Catalogue, Item, Section } from "./catalog.js";
import type { Finding } from "./findings.js";

export const MAX_DECLARED_DAYS = 14;

/** Two day counts: Venue Construction uses `vcDays`; Operations and Power use `opsDays`. */
export interface DeclaredDays {
  readonly vcDays: number;
  readonly opsDays: number;
}

export function declaredDaysFor(section: Section, days: DeclaredDays): number {
  return section === "VC" ? days.vcDays : days.opsDays;
}

export interface BilledDaysResult {
  readonly billedDays: number;
  readonly declaredDays: number;
  /** Set when an override beat the curve — a vendor-negotiated one-off. */
  readonly overrideApplied: boolean;
  readonly curveId: string;
  readonly findings: readonly Finding[];
}

/**
 * `override_days ?? curve[min(declared, 14)]`.
 * Clamping is explicit and reported: a 20-day show billed as 14 is a decision
 * the user should see, not discover in a total.
 */
export function billedDays(
  catalogue: Catalogue,
  item: Item,
  days: DeclaredDays,
  overrideDays: number | null,
): BilledDaysResult {
  const findings: Finding[] = [];
  const declared = declaredDaysFor(item.section, days);

  if (overrideDays !== null) {
    return {
      billedDays: overrideDays,
      declaredDays: declared,
      overrideApplied: true,
      curveId: item.dayCurve,
      findings,
    };
  }

  const curve = catalogue.curves.get(item.dayCurve);
  if (!curve) {
    findings.push({
      severity: "error",
      code: "CURVE_MISSING",
      itemCode: item.code,
      message: `Item ${item.code} references day curve "${item.dayCurve}", which is not in the catalogue.`,
    });
    return { billedDays: 0, declaredDays: declared, overrideApplied: false, curveId: item.dayCurve, findings };
  }

  let lookupDay = Math.max(1, Math.round(declared));
  if (lookupDay > MAX_DECLARED_DAYS) {
    findings.push({
      severity: "warning",
      code: "DAYS_CLAMPED",
      itemCode: item.code,
      message:
        `${declared} declared days exceeds the ${MAX_DECLARED_DAYS}-day curve table; ` +
        `billed as ${MAX_DECLARED_DAYS}. Extend the curve or set an override.`,
    });
    lookupDay = MAX_DECLARED_DAYS;
  }

  const value = curve.table[lookupDay];
  if (value === undefined) {
    findings.push({
      severity: "error",
      code: "CURVE_DAY_MISSING",
      itemCode: item.code,
      message: `Curve "${curve.id}" has no entry for day ${lookupDay}.`,
    });
    return { billedDays: 0, declaredDays: declared, overrideApplied: false, curveId: curve.id, findings };
  }

  return { billedDays: value, declaredDays: declared, overrideApplied: false, curveId: curve.id, findings };
}
