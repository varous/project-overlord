/**
 * Findings are how the engine refuses to lie.
 *
 * A quantity engine that invents a number for an item it cannot measure
 * produces a BOQ that is quietly, confidently wrong, and somebody quotes from
 * it. So an unquantifiable line stays out, the reason travels with it, and the
 * export gate blocks issuing it.
 */

export type Severity = "error" | "warning" | "info";

export interface Finding {
  readonly severity: Severity;
  /** Stable machine code so the UI can group and the tests can assert. */
  readonly code:
    | "CURVE_MISSING"
    | "CURVE_DAY_MISSING"
    | "ITEM_UNKNOWN"
    | "PARAM_MISSING"
    | "RULE_BASIS_MISMATCH"
    | "CONSUMPTION_MISSING"
    | "DAYS_CLAMPED"
    | "GEOMETRY_MISSING"
    | "FUEL_OMITTED"
    | "PLACEMENT_INVALID"
    | "PACKAGE_ONLY_ORPHAN"
    | "CANVAS_OMITS_KIT"
    | "QTY_RULE_CONFLICT";
  readonly message: string;
  readonly itemCode?: string;
  readonly packageId?: string;
  readonly instanceId?: string;
  readonly showItemId?: string;
}

export function isBlocking(findings: readonly Finding[]): boolean {
  return findings.some((f) => f.severity === "error");
}
