/**
 * Sizing rules as DATA, so the engine can cite each one.
 *
 * These are planning heuristics, NOT compliance figures. They must never be presented as a
 * compliance or safety guarantee.
 */

export interface SizingRule {
  id: string;
  label: string;
  /** One unit per this many people. */
  perPeople: number;
  min: number;
  source: string;
}

/** Every rule below carries this source string. */
export const PROVISIONAL_SOURCE = 'CAV practice, provisional — confirm against the licensing conditions';

export const SIZING_RULES: readonly SizingRule[] = [
  { id: 'toiletBlocks', label: 'toilet blocks', perPeople: 750, min: 1, source: PROVISIONAL_SOURCE },
  { id: 'entryGates', label: 'entry gates', perPeople: 2500, min: 2, source: PROVISIONAL_SOURCE },
  { id: 'friskingBooths', label: 'frisking booths', perPeople: 2000, min: 1, source: PROVISIONAL_SOURCE },
  { id: 'bars', label: 'bars', perPeople: 1250, min: 1, source: PROVISIONAL_SOURCE },
  { id: 'foodStalls', label: 'food stalls', perPeople: 1000, min: 1, source: PROVISIONAL_SOURCE },
  { id: 'ledWalls', label: 'LED walls', perPeople: 8000, min: 1, source: PROVISIONAL_SOURCE },
  { id: 'generators', label: 'generators', perPeople: 5000, min: 1, source: PROVISIONAL_SOURCE },
];

/** Planning density default, people per square metre. */
export const AUDIENCE_DENSITY_DEFAULT = 2.5;

export function findSizingRule(id: string): SizingRule | null {
  return SIZING_RULES.find((rule) => rule.id === id) ?? null;
}

/** Deterministic count: at least `min`, otherwise one per `perPeople`. */
export function sizingCount(rule: SizingRule, capacity: number): number {
  return Math.max(rule.min, Math.ceil(capacity / rule.perPeople));
}

/** Audience standing area for a capacity and density, in square metres. */
export function audienceAreaM2(capacity: number, density: number): number {
  return capacity / density;
}

/** A plain-English citation for a sizing rule, e.g. "1 per 1,000 people — CAV practice, provisional…". */
export function sizingReason(rule: SizingRule, count: number): string {
  const per = rule.perPeople.toLocaleString('en-US');
  return `assumed ${count} ${rule.label} — ${rule.source} (1 per ${per} people)`;
}
