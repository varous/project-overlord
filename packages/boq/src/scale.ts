/**
 * Scale calibration.
 *
 * This is the most load-bearing 40 lines in the product. Every quantity
 * downstream is a multiple of this number. Two rules follow, and
 * they are enforced by types rather than by discipline:
 *
 *   1. An uncalibrated base map yields `null` from every measurement function.
 *      There is no fallback, no default, no "approximately". README principle 2.
 *   2. We store the calibration geometry, not just the derived ratio, so a
 *      calibration can be re-examined and corrected later. ADR-005.
 */

import { distance, type Point } from "./geometry.js";
import { toMm, type LengthUnit, type Mm } from "./units.js";

/** What the user actually did: clicked two points, typed a real distance. */
export interface Calibration {
  /** First clicked point, in base-map image pixels. */
  readonly pointA: Point;
  /** Second clicked point, in base-map image pixels. */
  readonly pointB: Point;
  /** The real-world distance the user typed between those two points. */
  readonly knownDistance: number;
  readonly knownUnit: LengthUnit;
  readonly calibratedAt: string;
  readonly calibratedByUserId: string;
}

/** Derived, never stored as the source of truth. */
export interface Scale {
  /** Real-world millimetres per base-map pixel. */
  readonly mmPerPixel: number;
}

export class CalibrationError extends Error {}

export function deriveScale(c: Calibration): Scale {
  const pixels = distance(c.pointA, c.pointB);
  if (!Number.isFinite(pixels) || pixels <= 0) {
    throw new CalibrationError(
      "Calibration points are identical or invalid; cannot derive a scale.",
    );
  }
  const mm = toMm(c.knownDistance, c.knownUnit);
  if (!Number.isFinite(mm) || mm <= 0) {
    throw new CalibrationError("Known distance must be a positive number.");
  }
  return { mmPerPixel: mm / pixels };
}

/**
 * Convert a pixel measurement to canonical millimetres.
 * Returns null when there is no calibration - callers must handle it, which is
 * the point: the type system makes "we don't know the scale" unignorable.
 */
export function pixelsToMm(pixels: number, scale: Scale | null): Mm | null {
  if (scale === null) return null;
  return pixels * scale.mmPerPixel;
}

/** Square pixels to square millimetres. Note the squared ratio. */
export function sqPixelsToSqMm(sqPixels: number, scale: Scale | null): number | null {
  if (scale === null) return null;
  return sqPixels * scale.mmPerPixel * scale.mmPerPixel;
}

/** Soft-warn bounds — banquet halls can be ~20 m; outdoor grounds rarely > 2 km. */
export const IMPLAUSIBLE_WIDTH_MIN_M = 20;
export const IMPLAUSIBLE_WIDTH_MAX_M = 2000;
/** Calibration segment shorter than this fraction of image width amplifies click error. */
export const IMPLAUSIBLE_SPAN_MIN_FRACTION = 0.05;

export type ImplausibleReason = "width_too_small" | "width_too_large" | "span_too_short";

export interface ImplausibleCheck {
  readonly implausible: boolean;
  readonly impliedWidthM: number;
  readonly reasons: readonly ImplausibleReason[];
}

/**
 * Soft sanity check for the confirm UI / API.
 * Warns (does not hard-block) when the implied plan width is outside a
 * generous venue range, or when the reference segment is too short on the
 * image. Floor is 20 m so legitimate banquet halls do not train "Use anyway".
 */
export function calibrationLooksImplausible(
  scale: Scale,
  imageWidthPx: number,
  /** Pixel length of the calibration segment (point A→B). */
  segmentPx?: number,
): ImplausibleCheck {
  const impliedWidthM = (scale.mmPerPixel * imageWidthPx) / 1000;
  const reasons: ImplausibleReason[] = [];
  if (impliedWidthM < IMPLAUSIBLE_WIDTH_MIN_M) reasons.push("width_too_small");
  if (impliedWidthM > IMPLAUSIBLE_WIDTH_MAX_M) reasons.push("width_too_large");
  if (
    segmentPx != null &&
    imageWidthPx > 0 &&
    segmentPx / imageWidthPx < IMPLAUSIBLE_SPAN_MIN_FRACTION
  ) {
    reasons.push("span_too_short");
  }
  return {
    implausible: reasons.length > 0,
    impliedWidthM,
    reasons,
  };
}

/** Human copy — lead with the number a salesperson will recognise as absurd. */
export function formatImplausibleCalibrationMessage(check: ImplausibleCheck): string {
  const w = Math.round(check.impliedWidthM);
  if (check.reasons.includes("width_too_small")) {
    return (
      `That would make this plan about ${w} m wide — smaller than most venues. ` +
      `Check the distance you typed.`
    );
  }
  if (check.reasons.includes("width_too_large")) {
    return (
      `That would make this plan about ${w} m wide — larger than most venues. ` +
      `Check the distance you typed.`
    );
  }
  if (check.reasons.includes("span_too_short")) {
    return (
      `That would make this plan about ${w} m wide — the reference line is very ` +
      `short on the image, so a small click error becomes a large scale error.`
    );
  }
  return `That would make this plan about ${w} m wide — check the distance you typed.`;
}
