/**
 * Canonical units for project-overlord.
 *
 * The canonical length unit is the integer TENTH-MILLIMETRE, "tmm" (1 tmm = 0.1 mm = 1e-4 m).
 * Areas are integer square tenth-millimetres, "tmm2". All conversions are performed with exact
 * integer / BigInt arithmetic; no floating-point multiplication is used by `toTmm`, `fromTmm`
 * or `toDecimalString`.
 */

/** A length in integer tenth-millimetres (1 tmm = 0.1 mm). */
export type Tmm = number & { readonly __unit: 'tmm' };

/** An area in integer square tenth-millimetres. */
export type Tmm2 = number & { readonly __unit: 'tmm2' };

/** Units accepted for display and input. */
export type LengthUnit = 'm' | 'cm' | 'mm' | 'ft' | 'in';

/** Exact number of tmm in one of each unit. */
export const LENGTH_FACTORS = {
  m: 10000,
  cm: 100,
  mm: 10,
  ft: 3048,
  in: 254,
} as const satisfies Record<LengthUnit, number>;

/** Exact factors as BigInt for the exact conversion path. */
const LENGTH_FACTOR_BIGINT: Record<LengthUnit, bigint> = {
  m: 10000n,
  cm: 100n,
  mm: 10n,
  ft: 3048n,
  in: 254n,
};

export type UnitErrorCode = 'INVALID_DECIMAL' | 'NOT_EXACT' | 'NEGATIVE' | 'UNSAFE_INTEGER';

export class UnitError extends Error {
  readonly code: UnitErrorCode;

  constructor(code: UnitErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'UnitError';
    this.code = code;
  }
}

export interface ToTmmOptions {
  /** Permit a negative result. Defaults to false. */
  allowNegative?: boolean;
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);

// Optional sign, integer digits, optional point and fractional digits.
const DECIMAL_PATTERN = /^([+-]?)(\d*)(?:\.(\d*))?$/;

/**
 * Parse a decimal string exactly and convert it to integer tmm.
 *
 * No floating-point multiplication is used: the string is split into integer and fractional
 * digits, scaled with BigInt, and only converted back to a number after safety is checked.
 *
 * Throws `UnitError` with code:
 * - `INVALID_DECIMAL` when the string is not a decimal literal;
 * - `NOT_EXACT` when the value is not a whole number of tmm;
 * - `NEGATIVE` when negative and `allowNegative` is not true;
 * - `UNSAFE_INTEGER` when the result exceeds the safe integer range.
 */
export function toTmm(value: string, unit: LengthUnit, opts: ToTmmOptions = {}): Tmm {
  const match = DECIMAL_PATTERN.exec(value);
  if (match === null) {
    throw new UnitError('INVALID_DECIMAL', `Not a decimal string: ${JSON.stringify(value)}`);
  }

  const sign = match[1] ?? '';
  const intPart = match[2] ?? '';
  const fracPart = match[3] ?? '';
  if (intPart === '' && fracPart === '') {
    throw new UnitError('INVALID_DECIMAL', `Not a decimal string: ${JSON.stringify(value)}`);
  }

  const digits = `${intPart}${fracPart}`;
  const numerator = BigInt(digits === '' ? '0' : digits);
  const denominator = 10n ** BigInt(fracPart.length);
  const factor = LENGTH_FACTOR_BIGINT[unit];
  const scaled = numerator * factor;

  if (scaled % denominator !== 0n) {
    throw new UnitError('NOT_EXACT', `${value} ${unit} is not a whole number of tmm`);
  }

  let result = scaled / denominator;
  if (sign === '-') {
    result = -result;
  }

  if (result < 0n && opts.allowNegative !== true) {
    throw new UnitError('NEGATIVE', `Negative length not allowed: ${value} ${unit}`);
  }

  if (result > MAX_SAFE || result < MIN_SAFE) {
    throw new UnitError('UNSAFE_INTEGER', `Result is not a safe integer: ${value} ${unit}`);
  }

  return Number(result) as Tmm;
}

export interface Rational {
  /** Numerator (signed). */
  num: bigint;
  /** Denominator, always > 0, reduced by GCD. */
  den: bigint;
}

function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function gcdBigInt(a: bigint, b: bigint): bigint {
  let x = absBigInt(a);
  let y = absBigInt(b);
  while (y !== 0n) {
    const remainder = x % y;
    x = y;
    y = remainder;
  }
  return x;
}

/**
 * Exact value of `v` in `unit` as a reduced rational `{ num, den }` with `den > 0`.
 */
export function fromTmm(v: Tmm, unit: LengthUnit): Rational {
  const den = LENGTH_FACTOR_BIGINT[unit];
  const num = BigInt(v);
  const divisor = gcdBigInt(num, den);
  const safeDivisor = divisor === 0n ? 1n : divisor;
  return { num: num / safeDivisor, den: den / safeDivisor };
}

/**
 * Exact terminating decimal representation of `v` in `unit`, with no trailing zeros,
 * or `null` when the value is non-terminating in that unit.
 */
export function toDecimalString(v: Tmm, unit: LengthUnit): string | null {
  const { num, den } = fromTmm(v, unit);

  let rest = den;
  let twos = 0;
  let fives = 0;
  while (rest % 2n === 0n) {
    rest /= 2n;
    twos += 1;
  }
  while (rest % 5n === 0n) {
    rest /= 5n;
    fives += 1;
  }
  if (rest !== 1n) {
    return null;
  }

  const places = Math.max(twos, fives);
  const scaledInt = (num * 10n ** BigInt(places)) / den; // exact: den divides 10^places
  const negative = scaledInt < 0n;
  const absStr = (negative ? -scaledInt : scaledInt).toString();

  let intPart: string;
  let fracPart: string;
  if (places === 0) {
    intPart = absStr;
    fracPart = '';
  } else {
    const padded = absStr.padStart(places + 1, '0');
    intPart = padded.slice(0, padded.length - places);
    fracPart = padded.slice(padded.length - places);
  }
  fracPart = fracPart.replace(/0+$/, '');

  const magnitude = fracPart.length > 0 ? `${intPart}.${fracPart}` : intPart;
  return negative ? `-${magnitude}` : magnitude;
}

/**
 * Human-readable length. Display only: may round and is never used in a calculation.
 */
export function formatLength(v: Tmm, unit: LengthUnit, dp: number): string {
  const places = Math.max(0, Math.trunc(dp));
  const value = (v as number) / LENGTH_FACTORS[unit];
  return `${value.toFixed(places)} ${unit}`;
}

/**
 * Area of a rectangle with side lengths `a` and `b`, in square tmm.
 *
 * Throws `UnitError` with code `UNSAFE_INTEGER` when the product is not a safe integer.
 */
export function areaTmm2(a: Tmm, b: Tmm): Tmm2 {
  const product = (a as number) * (b as number);
  if (!Number.isSafeInteger(product)) {
    throw new UnitError('UNSAFE_INTEGER', `Area is not a safe integer: ${a} * ${b}`);
  }
  return product as Tmm2;
}
