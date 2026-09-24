/**
 * Boolean polygon operations, offsets and splits over integer tmm rings.
 *
 * The only external dependency is polygon-clipping (MIT); results are rounded back to integer tmm
 * and validated with geo-core's isSimpleRing, so a bad result is a typed error, never bad geometry.
 */

import { isSimpleRing, signedArea2 } from '@overlord/geo-core';
import polygonClipping from 'polygon-clipping';

export interface Point2 {
  x: number;
  y: number;
}
export type Ring = Point2[];

export type GeomErrorCode =
  | 'NOT_SIMPLE'
  | 'EMPTY'
  | 'HOLES_NOT_ALLOWED'
  | 'COLLAPSED';

export interface GeomError {
  ok: false;
  error: { code: GeomErrorCode; message: string };
}

export interface GeomResult {
  ok: true;
  /** Outer rings, CCW and simple. */
  rings: Ring[];
  /** Holes, CCW and simple; only a difference may return holes. */
  holes: Ring[];
}

export type GeomOutcome = GeomResult | GeomError;

type Pair = [number, number];
type Polygon = Pair[][];

function error(code: GeomErrorCode, message: string): GeomError {
  return { ok: false, error: { code, message } };
}

function toPolygon(ring: Ring): Pair[] {
  return ring.map((point) => [point.x, point.y] as Pair);
}

function fromRing(ring: Pair[]): Ring {
  return ring.map((point) => ({ x: Math.round(point[0]), y: Math.round(point[1]) }));
}

/**
 * polygon-clipping keeps collinear vertices, which geo-core's isSimpleRing treats as touching
 * edges. Drop consecutive duplicates and collinear points before validating.
 */
function simplifyRing(points: Ring): Ring {
  const deduped = points.filter(
    (point, index, list) =>
      index === 0 || point.x !== list[index - 1]?.x || point.y !== list[index - 1]?.y,
  );
  const first = deduped[0];
  const last = deduped[deduped.length - 1];
  if (
    deduped.length > 1 &&
    first !== undefined &&
    last !== undefined &&
    first.x === last.x &&
    first.y === last.y
  ) {
    deduped.pop();
  }
  const out: Ring = [];
  for (let index = 0; index < deduped.length; index += 1) {
    const previous = deduped[(index - 1 + deduped.length) % deduped.length];
    const current = deduped[index];
    const next = deduped[(index + 1) % deduped.length];
    if (previous === undefined || current === undefined || next === undefined) {
      continue;
    }
    const cross =
      (current.x - previous.x) * (next.y - previous.y) -
      (current.y - previous.y) * (next.x - previous.x);
    if (cross !== 0) {
      out.push(current);
    }
  }
  return out;
}

function normalise(multi: Polygon[]): GeomOutcome {
  const rings: Ring[] = [];
  const holes: Ring[] = [];
  for (const polygon of multi) {
    for (const [index, ring] of polygon.entries()) {
      const converted = simplifyRing(fromRing(ring));
      if (converted.length < 3 || !isSimpleRing(converted)) {
        return error('NOT_SIMPLE', 'A boolean result was not a simple ring.');
      }
      // Normalise every ring to CCW; holes are still returned separately.
      if (signedArea2(converted) < 0) {
        converted.reverse();
      }
      if (index === 0) {
        rings.push(converted);
      } else {
        holes.push(converted);
      }
    }
  }
  if (rings.length === 0) {
    return error('EMPTY', 'The boolean result was empty.');
  }
  return { ok: true, rings, holes };
}

function booleanOp(
  kind: 'union' | 'difference' | 'intersection',
  ringsA: Ring[],
  ringsB: Ring[],
): GeomOutcome {
  const a = ringsA.map(toPolygon);
  const b = ringsB.map(toPolygon);
  if (a.length === 0 || b.length === 0) {
    return error('EMPTY', 'Both operands need at least one ring.');
  }
  for (const ring of [...ringsA, ...ringsB]) {
    if (ring.length < 3 || !isSimpleRing(ring)) {
      return error('NOT_SIMPLE', 'An input ring is not a simple ring.');
    }
  }
  let result: Polygon[];
  try {
    result = polygonClipping[kind](a, b) as Polygon[];
  } catch {
    return error('NOT_SIMPLE', 'polygon-clipping rejected the input (a ring may self-intersect).');
  }
  const outcome = normalise(result);
  if (!outcome.ok) {
    return outcome;
  }
  if (kind !== 'difference' && outcome.holes.length > 0) {
    return error('HOLES_NOT_ALLOWED', `A ${kind} result with holes is not supported.`);
  }
  return outcome;
}

export function union(ringsA: Ring[], ringsB: Ring[]): GeomOutcome {
  return booleanOp('union', ringsA, ringsB);
}

export function difference(ringsA: Ring[], ringsB: Ring[]): GeomOutcome {
  return booleanOp('difference', ringsA, ringsB);
}

export function intersection(ringsA: Ring[], ringsB: Ring[]): GeomOutcome {
  return booleanOp('intersection', ringsA, ringsB);
}

interface Line {
  px: number;
  py: number;
  dx: number;
  dy: number;
}

function intersectLines(a: Line, b: Line): Point2 | null {
  const denom = a.dx * b.dy - a.dy * b.dx;
  if (Math.abs(denom) < 1e-9) {
    return null;
  }
  const t = ((b.px - a.px) * b.dy - (b.py - a.py) * b.dx) / denom;
  return { x: a.px + t * a.dx, y: a.py + t * a.dy };
}

/**
 * Offset a ring: positive grows, negative shrinks, using miter joins. Returns null when the
 * shrink collapses the ring (or the result would not be a simple ring).
 */
export function offsetRing(ring: Ring, distanceTmm: number): Ring | null {
  if (ring.length < 3) {
    return null;
  }
  const ccw = signedArea2(ring) > 0 ? ring : [...ring].reverse();
  const original = signedArea2(ccw);
  const count = ccw.length;

  const lines: Line[] = [];
  for (let index = 0; index < count; index += 1) {
    const from = ccw[index];
    const to = ccw[(index + 1) % count];
    if (from === undefined || to === undefined) {
      return null;
    }
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) {
      return null;
    }
    const ux = dx / length;
    const uy = dy / length;
    // Outward normal for a CCW ring is (uy, -ux).
    lines.push({ px: from.x + uy * distanceTmm, py: from.y - ux * distanceTmm, dx: ux, dy: uy });
  }

  const out: Ring = [];
  for (let index = 0; index < count; index += 1) {
    const previous = lines[(index - 1 + count) % count];
    const current = lines[index];
    if (previous === undefined || current === undefined) {
      return null;
    }
    const corner = intersectLines(previous, current);
    if (corner === null) {
      return null;
    }
    out.push({ x: Math.round(corner.x), y: Math.round(corner.y) });
  }

  if (out.length < 3 || !isSimpleRing(out)) {
    return null;
  }
  const area = signedArea2(out);
  if (area <= 0) {
    return null;
  }
  if (distanceTmm < 0 && area >= original) {
    return null;
  }
  return out;
}

interface SegmentHit {
  t: number;
  edgeIndex: number;
  point: Point2;
}

function segmentLineIntersection(from: Point2, to: Point2, start: Point2, end: Point2): SegmentHit | null {
  const rx = to.x - from.x;
  const ry = to.y - from.y;
  const sx = end.x - start.x;
  const sy = end.y - start.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-9) {
    return null;
  }
  const t = ((start.x - from.x) * sy - (start.y - from.y) * sx) / denom;
  const u = ((start.x - from.x) * ry - (start.y - from.y) * rx) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) {
    return null;
  }
  return { t: u, edgeIndex: 0, point: { x: from.x + t * rx, y: from.y + t * ry } };
}

/** Split a ring by a line segment. Returns one ring when the line misses it, otherwise two. */
export function splitRing(ring: Ring, lineStart: Point2, lineEnd: Point2): Ring[] {
  if (ring.length < 3) {
    return [ring];
  }
  const hits: SegmentHit[] = [];
  for (let index = 0; index < ring.length; index += 1) {
    const from = ring[index];
    const to = ring[(index + 1) % ring.length];
    if (from === undefined || to === undefined) {
      continue;
    }
    const hit = segmentLineIntersection(from, to, lineStart, lineEnd);
    if (hit !== null) {
      const point = { x: Math.round(hit.point.x), y: Math.round(hit.point.y) };
      hits.push({ ...hit, edgeIndex: index, point });
    }
  }
  if (hits.length < 2) {
    return [ring];
  }
  hits.sort((a, b) => a.t - b.t);
  const first = hits[0];
  const last = hits[hits.length - 1];
  if (first === undefined || last === undefined || first.edgeIndex === last.edgeIndex) {
    return [ring];
  }

  const arc = (fromEdge: number, fromPoint: Point2, toEdge: number, toPoint: Point2): Ring => {
    const points: Ring = [fromPoint];
    let index = (fromEdge + 1) % ring.length;
    let guard = 0;
    while (guard < ring.length + 1) {
      const point = ring[index];
      if (point !== undefined) {
        points.push({ x: point.x, y: point.y });
      }
      if (index === toEdge) {
        break;
      }
      index = (index + 1) % ring.length;
      guard += 1;
    }
    points.push(toPoint);
    return points;
  };

  const a = arc(first.edgeIndex, first.point, last.edgeIndex, last.point);
  const b = arc(last.edgeIndex, last.point, first.edgeIndex, first.point);
  const result: Ring[] = [];
  for (const candidate of [a, b]) {
    const deduped = candidate.filter(
      (point, index, list) => index === 0 || point.x !== list[index - 1]?.x || point.y !== list[index - 1]?.y,
    );
    if (deduped.length >= 3 && isSimpleRing(deduped)) {
      result.push(deduped);
    }
  }
  return result.length > 0 ? result : [ring];
}
