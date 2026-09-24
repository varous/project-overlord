/**
 * Canonical storage is SI: millimetres for length, square millimetres for area.
 * Display units are a presentation concern and never enter a calculation.
 * See docs/08-domain-logic.md, "Units, money and rounding".
 */

export type LengthUnit = "mm" | "cm" | "m" | "ft" | "in";
export type AreaUnit = "sqm" | "sqft";

const MM_PER: Record<LengthUnit, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  ft: 304.8,
  in: 25.4,
};

/** Millimetres are the canonical internal unit. */
export type Mm = number;

export function toMm(value: number, unit: LengthUnit): Mm {
  return value * MM_PER[unit];
}

export function fromMm(mm: Mm, unit: LengthUnit): number {
  return mm / MM_PER[unit];
}

/** Canonical area unit is square millimetres. */
export type SqMm = number;

export function sqMmTo(area: SqMm, unit: AreaUnit): number {
  return unit === "sqm" ? area / 1_000_000 : area / 92_903.04;
}

/** Inverse of `sqMmTo`. Display units never enter a calculation except through here. */
export function toSqMm(value: number, unit: AreaUnit): SqMm {
  return unit === "sqm" ? value * 1_000_000 : value * 92_903.04;
}

/**
 * Format a length for display. Deliberately not locale-aware yet - the sales
 * team works in metres, and feet-and-inches is a Phase 1 concern.
 */
export function formatLength(mm: Mm, unit: LengthUnit = "m", dp = 2): string {
  return `${fromMm(mm, unit).toFixed(dp)} ${unit}`;
}

/**
 * Canvas measurement label. Primary is the calibration unit; the other of
 * m/ft is always in parentheses so mixed Indian site talk needs no toggle.
 */
export function otherLengthUnit(primary: LengthUnit): LengthUnit {
  return primary === "ft" ? "m" : "ft";
}

export function formatDualLength(mm: Mm, primary: LengthUnit, dp = 1): string {
  return `${formatLength(mm, primary, dp)} (${formatLength(mm, otherLengthUnit(primary), dp)})`;
}
