/**
 * Pure 2D geometry in canonical millimetres. No canvas, no React, no DOM.
 * Reference implementation borrowed conceptually from OpenTakeoff (Apache-2.0);
 * see docs/10-head-start-analysis.md.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export function distance(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Total length of an open polyline. */
export function polylineLength(points: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distance(points[i - 1]!, points[i]!);
  }
  return total;
}

/** Perimeter of a closed polygon (implicitly closes last -> first). */
export function perimeter(points: readonly Point[]): number {
  if (points.length < 2) return 0;
  return polylineLength(points) + distance(points[points.length - 1]!, points[0]!);
}

/**
 * Signed area via the shoelace formula; the absolute value is the area.
 * Sign is retained internally because it tells us winding order, which is how
 * a "deduct" region is distinguished from an additive one.
 */
export function signedArea(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function area(points: readonly Point[]): number {
  return Math.abs(signedArea(points));
}

export function isClockwise(points: readonly Point[]): boolean {
  return signedArea(points) < 0;
}

export function rotate(p: Point, origin: Point, radians: number): Point {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  };
}

export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export function boundsOf(points: readonly Point[]): Bounds | null {
  if (points.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}
