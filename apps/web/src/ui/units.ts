/** Display-unit helpers. Internals are always tmm; these only format and parse presentation. */

import { formatLength, toTmm, type LengthUnit, type Tmm } from '@overlord/geo-core';

export type DisplayUnit = 'ft' | 'm';

/** "60.00 ft" → "60 ft"; "18.29 m" stays "18.29 m". */
export function formatTrimmed(value: Tmm, unit: DisplayUnit, dp = 2): string {
  const raw = formatLength(value, unit, dp);
  const number = raw.replace(/ [a-z]+$/, '');
  const trimmed = number.includes('.') ? number.replace(/0+$/, '').replace(/\.$/, '') : number;
  return `${trimmed} ${unit}`;
}

/** e.g. "60 ft (18.29 m)" in the chosen unit, with the other unit in brackets. */
export function formatBoth(value: Tmm, unit: DisplayUnit): string {
  const other: DisplayUnit = unit === 'ft' ? 'm' : 'ft';
  return `${formatTrimmed(value, unit)} (${formatTrimmed(value, other)})`;
}

/** Parse a user-entered value in the display unit back to tmm, or null when invalid. */
export function parseValue(text: string, unit: DisplayUnit): Tmm | null {
  const cleaned = text
    .trim()
    .replace(/\s*[a-z]+$/i, '')
    .trim();
  if (cleaned === '') {
    return null;
  }
  try {
    return toTmm(cleaned, unit as LengthUnit, { allowNegative: true });
  } catch {
    return null;
  }
}
