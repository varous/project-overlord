/**
 * The data contract from ClockworkAV_BOQ_seed_v1 / SCHEMA.md.
 *
 * These types mirror the seed bundle exactly. The bundle is regenerated from a
 * master Excel sheet and re-imported regularly, so nothing here may drift from
 * it — and nothing in this package may hardcode an item code, a curve name, a
 * city, or a package's contents. All of that is replaceable data.
 */

export type Section = "VC" | "OPS" | "POWER";

/**
 * Human words for a section code. Prose, UI and client copy use these.
 * Keys, enums and column values stay `VC` | `OPS` | `POWER`.
 * See AGENTS.md glossary. `TECH` is not a section.
 */
export const SECTION_LABEL: Record<Section, string> = {
  VC: "Venue Construction",
  OPS: "Operations",
  POWER: "Power",
};

/** How an item's quantity derives from the layout. SCHEMA.md → items.qty_basis. */
export type QtyBasis =
  | "AREA"                  // sqft footprint
  | "LENGTH"                // running ft
  | "VOLUME"                // cbm
  | "COUNT"                 // nos
  | "COUNT_PER_DAY"         // headcount/rental; day scaling is the curve's job, not the qty's
  | "CONSUMPTION_PER_HOUR"; // litres/hour — fuel burn is physics, carried on the item row

export interface Item {
  readonly code: string;              // PRIMARY KEY, immutable, never reused
  readonly name: string;
  readonly category: string;
  readonly section: Section;
  readonly unit: string;              // display only; never enters a calculation
  readonly qtyBasis: QtyBasis;
  readonly dayCurve: string;          // FK → DayCurve.id. NOT an enum — extensible data
  readonly tags: readonly string[];   // search / NLP corpus, user-maintained free text
  /**
   * Future QuoteOS join key. Opaque and nullable: it carries no value and is
   * never resolved inside this repo (money is never computed here).
   */
  readonly linkedRateItem: string | null;
  /**
   * Fuel burn in litres per running hour, for a CONSUMPTION_PER_HOUR item.
   * Physics, not price — a property of the item row, never a rate. Null for
   * every other basis.
   */
  readonly consumptionLitresPerHour: number | null;
  readonly powerSupplyKva: number | null;
  readonly notes: string | null;
  readonly sortOrder: number;
  /**
   * Where this item is used. Data, not an engine `if`.
   * CANVAS — placed on the plan (auto-packaged at import).
   * SHOW — belongs to the show, not a spot (ShowItem tray).
   * PACKAGE_ONLY — never standalone (fuel follows its genset).
   */
  readonly placement: Placement;
}

/** How an item enters a quotation. Stored on the item row; never inferred in the engine. */
export type Placement = "CANVAS" | "SHOW" | "PACKAGE_ONLY";

export const PLACEMENTS: readonly Placement[] = ["CANVAS", "SHOW", "PACKAGE_ONLY"];

/** Auto-generated single-item templates use this prefix so they never collide with hand `PKG_*` ids. */
export const AUTO_PACKAGE_PREFIX = "AUTO_";

export function autoPackageId(itemCode: string): string {
  return `${AUTO_PACKAGE_PREFIX}${itemCode}`;
}

/** `{1..14 → billed days}`. Values may be fractional (day-curve `VC` day 4 → 1.5). */
export interface DayCurve {
  readonly id: string;
  readonly table: Readonly<Record<number, number>>;
}

export type QtyRuleKind =
  | "FIXED"
  | "PER_AREA"
  | "PER_LENGTH"
  | "PER_COUNT_PARAM"
  | "PER_FRONT_FACE"
  | "PER_VOLUME";

export interface QtyRule {
  readonly kind: QtyRuleKind;
  /** Set when kind is PER_COUNT_PARAM, PER_FRONT_FACE, or PER_VOLUME. */
  readonly param: string | null;
}

export type PackageItemFlag = "MANDATORY" | "DEFAULT_ON" | "OPTIONAL";

export interface PackageItem {
  readonly packageId: string;
  readonly itemCode: string;
  readonly rule: QtyRule;
  readonly qtyValue: number;
  readonly flag: PackageItemFlag;
}

export interface PackageTemplate {
  readonly packageId: string;
  readonly name: string;
  readonly description: string | null;
  readonly params: readonly string[];
  readonly lines: readonly PackageItem[];
  /**
   * True when generated at import for a CANVAS item. The palette lists these
   * under Items, not Packages. Hand-authored templates are `false`.
   */
  readonly auto: boolean;
}

/** Everything the BOQ engine needs, indexed. Built once per request. */
export interface Catalogue {
  readonly items: ReadonlyMap<string, Item>;
  readonly curves: ReadonlyMap<string, DayCurve>;
  readonly packages: ReadonlyMap<string, PackageTemplate>;
  /** Stamped at import. Every BOQ records which snapshot it was built from. */
  readonly version: string;
}

const QTY_RULE_KINDS: ReadonlySet<string> = new Set([
  "FIXED", "PER_AREA", "PER_LENGTH", "PER_COUNT_PARAM", "PER_FRONT_FACE", "PER_VOLUME",
]);
const QTY_RULE_NEEDS_PARAM: ReadonlySet<string> = new Set([
  "PER_COUNT_PARAM", "PER_FRONT_FACE", "PER_VOLUME",
]);

/** Parse `PER_COUNT_PARAM:lanes`, `PER_FRONT_FACE:height_ft`, and friends. */
export function parseQtyRule(raw: string): QtyRule {
  const [kind, param] = raw.split(":", 2) as [string, string | undefined];
  if (!QTY_RULE_KINDS.has(kind)) {
    throw new Error(`Unknown qty_rule kind: ${raw}`);
  }
  if (QTY_RULE_NEEDS_PARAM.has(kind) && !param) {
    throw new Error(`${kind} requires a parameter name: ${raw}`);
  }
  return { kind: kind as QtyRuleKind, param: param ?? null };
}

export function formatQtyRule(rule: QtyRule): string {
  return rule.param ? `${rule.kind}:${rule.param}` : rule.kind;
}

/**
 * qty_rule for a single-item CANVAS package.
 * `autoQtyRule` is seed DATA (e.g. vertical masking → PER_FRONT_FACE) and
 * wins when present. Otherwise: AREA→PER_AREA, LENGTH→PER_LENGTH,
 * VOLUME→PER_VOLUME:height_ft, COUNT / COUNT_PER_DAY→FIXED.
 * Fuel bases return null — those items must not be auto-packaged.
 */
export function qtyRuleForCanvasItem(
  basis: QtyBasis,
  autoQtyRule?: string | null,
): QtyRule | null {
  if (autoQtyRule) return parseQtyRule(autoQtyRule);
  if (basis === "AREA") return { kind: "PER_AREA", param: null };
  if (basis === "LENGTH") return { kind: "PER_LENGTH", param: null };
  if (basis === "VOLUME") return { kind: "PER_VOLUME", param: "height_ft" };
  if (basis === "COUNT" || basis === "COUNT_PER_DAY") {
    return { kind: "FIXED", param: null };
  }
  return null;
}
