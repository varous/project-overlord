/**
 * Issue/export gating for geometry-dependent quantities.
 *
 * Three layout states matter commercially:
 *   - NO MAP — legitimate (genset-only enquiry). Count/fixed quoting exports.
 *   - MAP PRESENT, UNCALIBRATED — suspicious; UI warns; export still allowed
 *     unless a line would invent a geometry-derived number.
 *   - CALIBRATED — normal.
 *
 * The rule is mechanical from qty_rule only:
 *   PER_AREA / PER_LENGTH / PER_FRONT_FACE / PER_VOLUME → need scale
 *   FIXED / PER_COUNT_PARAM → do not
 * Show-level items are declared quantities (FIXED). They never need scale.
 * Soft inference ("looks like it needs a plan") is forbidden.
 */

import type { QtyRule, QtyRuleKind } from "./catalog.js";
import type { Scale } from "./scale.js";

export function isGeometryDependentQtyRule(kind: QtyRuleKind): boolean {
  return kind === "PER_AREA" || kind === "PER_LENGTH"
    || kind === "PER_FRONT_FACE" || kind === "PER_VOLUME";
}

export interface ExportLineRef {
  readonly itemCode: string;
  readonly rule: QtyRule;
  /** Optional human label for the block message (package / line name). */
  readonly label?: string;
}

export interface ExportBlocker {
  readonly itemCode: string;
  readonly qtyRule: QtyRuleKind;
  readonly label: string | null;
  readonly reason: string;
}

/**
 * Returns blockers when scale is null and any line is geometry-dependent.
 * A calibrated scale (even with no map — shouldn't happen) clears the gate.
 */
export function geometryExportBlockers(args: {
  readonly scale: Scale | null;
  readonly lines: readonly ExportLineRef[];
}): ExportBlocker[] {
  if (args.scale !== null) return [];
  const out: ExportBlocker[] = [];
  for (const line of args.lines) {
    if (!isGeometryDependentQtyRule(line.rule.kind)) continue;
    out.push({
      itemCode: line.itemCode,
      qtyRule: line.rule.kind,
      label: line.label ?? null,
      reason: `${line.rule.kind} quantity needs a calibrated scale`,
    });
  }
  return out;
}

/** Client-facing copy — names lines so the fix is obvious. */
export function formatExportBlockedMessage(blockers: readonly ExportBlocker[]): string {
  if (blockers.length === 0) return "";
  const named = blockers.map((b) => {
    const who = b.label ? `${b.label} (${b.itemCode})` : b.itemCode;
    return `${who}: ${b.reason}`;
  });
  return (
    `Cannot issue or export — calibrate the venue plan (or remove these lines): ` +
    named.join("; ")
  );
}
