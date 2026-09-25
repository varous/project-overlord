/**
 * Pure helpers for the BOQ panel: section grouping, finding order, and CSV.
 * Kept out of the component so they can be tested without rendering.
 */
import { SECTION_LABEL, type Section } from "@overlord/boq";
import type { BoqFinding, BoqLine } from "./api.js";

export const SECTION_ORDER: readonly Section[] = ["VC", "OPS", "POWER"];

export function sectionLabel(section: string): string {
  return SECTION_LABEL[section as Section] ?? section;
}

export interface BoqSectionGroup {
  section: Section;
  label: string;
  lines: BoqLine[];
}

/** Lines grouped by section, in VC → OPS → POWER order; empty sections omitted. */
export function groupBySection(lines: readonly BoqLine[]): BoqSectionGroup[] {
  return SECTION_ORDER.map((section) => ({
    section,
    label: sectionLabel(section),
    lines: lines.filter((l) => l.section === section),
  })).filter((group) => group.lines.length > 0);
}

const SEVERITY_ORDER: Record<BoqFinding["severity"], number> = {
  error: 0,
  warning: 1,
  info: 2,
};

/** Errors first, then warnings, then info — findings are read before lines. */
export function orderFindings(findings: readonly BoqFinding[]): BoqFinding[] {
  return [...findings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

export function contributionSummary(line: BoqLine): string {
  return line.contributions.map((c) => `${c.variantName}×${c.qty}`).join("; ");
}

export const CSV_HEADER = "Section,Category,Code,Item,Qty,Unit,Basis,Contributions";

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** One header row, then exactly one row per BOQ line. */
export function toCsv(lines: readonly BoqLine[]): string {
  const rows = lines.map((line) =>
    [
      sectionLabel(line.section),
      line.category,
      line.itemCode,
      line.name,
      line.qty,
      line.unit,
      line.qtyBasis,
      contributionSummary(line),
    ]
      .map(csvCell)
      .join(","),
  );
  return [CSV_HEADER, ...rows].join("\n");
}

/** `<project name>-boq-<yyyy-mm-dd>.csv`. */
export function csvFilename(projectName: string, date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const safe = projectName.trim().replace(/[\\/:*?"<>|]+/g, "-") || "project";
  return `${safe}-boq-${yyyy}-${mm}-${dd}.csv`;
}
