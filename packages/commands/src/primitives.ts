/**
 * Pure geometry generators used by the mouse today and by the layout engine and the agent later.
 * They take rings and numbers and never call geom2: boolean operations stay in the app layer.
 */

import { isSimpleRing, signedArea2, type LocalPoint, type Tmm } from '@overlord/geo-core';
import type { Ring2 } from '@overlord/scene';

import { normalizeAngleDeg } from './snapping.js';

/** Local 2D point (x/y only; z is dropped by ring generators). */
export interface Point2 {
  x: Tmm;
  y: Tmm;
}

/**
 * CCW rectangle ring. Rotation follows the site convention (clockwise positive relative to +Y):
 * x' = x·cos + y·sin, y' = -x·sin + y·cos. Values are exact integers.
 */
export function rectRing(centre: LocalPoint, sizeX: Tmm, sizeY: Tmm, rotationDeg = 0): Ring2 {
  const halfX = (sizeX as number) / 2;
  const halfY = (sizeY as number) / 2;
  const radians = (normalizeAngleDeg(rotationDeg) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const corner = (dx: number, dy: number): Point2 => ({
    x: Math.round((centre.x as number) + dx * cos + dy * sin) as Tmm,
    y: Math.round((centre.y as number) - dx * sin + dy * cos) as Tmm,
  });
  return [
    corner(-halfX, -halfY),
    corner(halfX, -halfY),
    corner(halfX, halfY),
    corner(-halfX, halfY),
  ];
}

/**
 * Validate a polygon as a simple CCW ring, reversing it when it is clockwise.
 * Throws when the polygon self-intersects or has fewer than 3 points.
 */
export function polygonRing(points: readonly Point2[]): Ring2 {
  if (points.length < 3) {
    throw new Error('A polygon needs at least 3 points.');
  }
  const ring = points.map((point) => ({ x: point.x, y: point.y }));
  if (!isSimpleRing(ring)) {
    throw new Error('The polygon must not self-intersect.');
  }
  return signedArea2(ring) > 0 ? ring : ring.reverse();
}

export interface ArrayOptions {
  /** Include points at both ends of the line (default true). */
  includeEnds?: boolean;
  /** Distance to inset from each end, in tmm. */
  insetTmm?: number;
}

export interface ArrayedPoint {
  point: LocalPoint;
  /** Heading of the line at that point, clockwise from +Y, normalised to [0, 360). */
  headingDeg: number;
}

function headingOf(dx: number, dy: number): number {
  return normalizeAngleDeg((Math.atan2(dx, dy) * 180) / Math.PI);
}

/** Evenly spaced points along a straight line, with the line heading at each point. */
export function arrayAlongLine(
  from: LocalPoint,
  to: LocalPoint,
  spacingTmm: Tmm,
  opts: ArrayOptions = {},
): ArrayedPoint[] {
  const spacing = spacingTmm as number;
  if (!(spacing > 0)) {
    return [];
  }
  const dx = (to.x as number) - (from.x as number);
  const dy = (to.y as number) - (from.y as number);
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return [];
  }
  const inset = opts.insetTmm ?? 0;
  const usable = length - 2 * inset;
  if (usable < 0) {
    return [];
  }
  const ux = dx / length;
  const uy = dy / length;
  const headingDeg = headingOf(dx, dy);
  const includeEnds = opts.includeEnds ?? true;
  const count = includeEnds ? Math.floor(usable / spacing) + 1 : Math.floor(usable / spacing);
  const out: ArrayedPoint[] = [];
  for (let index = 0; index < count; index += 1) {
    const along = includeEnds
      ? inset + (count === 1 ? 0 : index * (usable / (count - 1)))
      : inset + (index + 0.5) * spacing;
    out.push({
      point: {
        x: Math.round((from.x as number) + ux * along) as Tmm,
        y: Math.round((from.y as number) + uy * along) as Tmm,
        z: from.z,
      },
      headingDeg,
    });
  }
  return out;
}

/** Evenly spaced points around a ring's perimeter (the closing point is not repeated). */
export function arrayAlongRing(
  ring: Ring2,
  spacingTmm: Tmm,
  opts: ArrayOptions = {},
): ArrayedPoint[] {
  const spacing = spacingTmm as number;
  if (!(spacing > 0) || ring.length < 3) {
    return [];
  }
  const inset = opts.insetTmm ?? 0;

  const segments: { from: Point2; to: Point2; length: number; headingDeg: number }[] = [];
  let perimeter = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const from = ring[index];
    const to = ring[(index + 1) % ring.length];
    if (from === undefined || to === undefined) {
      continue;
    }
    const dx = (to.x as number) - (from.x as number);
    const dy = (to.y as number) - (from.y as number);
    const length = Math.hypot(dx, dy);
    segments.push({ from, to, length, headingDeg: headingOf(dx, dy) });
    perimeter += length;
  }

  const usable = perimeter - 2 * inset;
  if (usable < spacing) {
    return [];
  }
  const count = Math.floor(usable / spacing);
  const out: ArrayedPoint[] = [];
  for (let index = 0; index < count; index += 1) {
    let distance = inset + index * spacing;
    for (const segment of segments) {
      if (distance <= segment.length || segment === segments[segments.length - 1]) {
        const t = segment.length === 0 ? 0 : Math.min(1, distance / segment.length);
        out.push({
          point: {
            x: Math.round((segment.from.x as number) + ((segment.to.x as number) - (segment.from.x as number)) * t) as Tmm,
            y: Math.round((segment.from.y as number) + ((segment.to.y as number) - (segment.from.y as number)) * t) as Tmm,
            z: 0 as Tmm,
          },
          headingDeg: segment.headingDeg,
        });
        break;
      }
      distance -= segment.length;
    }
  }
  return out;
}

function pointInRing(x: number, y: number, ring: Ring2): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const current = ring[i];
    const previous = ring[j];
    if (current === undefined || previous === undefined) {
      continue;
    }
    const xi = current.x as number;
    const yi = current.y as number;
    const xj = previous.x as number;
    const yj = previous.y as number;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

function distanceToEdges(x: number, y: number, ring: Ring2): number {
  let min = Number.POSITIVE_INFINITY;
  for (let index = 0; index < ring.length; index += 1) {
    const from = ring[index];
    const to = ring[(index + 1) % ring.length];
    if (from === undefined || to === undefined) {
      continue;
    }
    const x1 = from.x as number;
    const y1 = from.y as number;
    const x2 = to.x as number;
    const y2 = to.y as number;
    const ex = x2 - x1;
    const ey = y2 - y1;
    const lengthSquared = ex * ex + ey * ey;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * ex + (y - y1) * ey) / lengthSquared));
    const px = x1 + t * ex;
    const py = y1 + t * ey;
    min = Math.min(min, Math.hypot(x - px, y - py));
  }
  return min;
}

/** Grid points strictly inside the ring, at least `marginTmm` from every edge. */
export function gridFill(
  ring: Ring2,
  spacingX: Tmm,
  spacingY: Tmm,
  marginTmm: Tmm,
): LocalPoint[] {
  const spacingXNum = spacingX as number;
  const spacingYNum = spacingY as number;
  const margin = marginTmm as number;
  if (!(spacingXNum > 0) || !(spacingYNum > 0) || ring.length < 3) {
    return [];
  }
  const xs = ring.map((point) => point.x as number);
  const ys = ring.map((point) => point.y as number);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const out: LocalPoint[] = [];
  for (let x = minX + margin; x <= maxX - margin; x += spacingXNum) {
    for (let y = minY + margin; y <= maxY - margin; y += spacingYNum) {
      if (pointInRing(x, y, ring) && distanceToEdges(x, y, ring) >= margin) {
        out.push({ x: Math.round(x) as Tmm, y: Math.round(y) as Tmm, z: 0 as Tmm });
      }
    }
  }
  return out;
}
