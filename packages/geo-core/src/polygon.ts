/**
 * Planar polygon predicates. PURE module: no dependencies, exact integer arithmetic via BigInt
 * so orientation tests never overflow.
 */

export interface Point2 {
  x: number;
  y: number;
}

/** Twice the signed area of a ring. Positive = counter-clockwise (viewed from +Z). */
export function signedArea2(ring: readonly Point2[]): number {
  const n = ring.length;
  if (n < 3) {
    return 0;
  }
  let sum = 0n;
  for (let i = 0; i < n; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    if (a === undefined || b === undefined) {
      continue;
    }
    sum += BigInt(a.x) * BigInt(b.y) - BigInt(b.x) * BigInt(a.y);
  }
  return Number(sum);
}

function orient(a: Point2, b: Point2, c: Point2): bigint {
  const abx = BigInt(b.x) - BigInt(a.x);
  const aby = BigInt(b.y) - BigInt(a.y);
  const acx = BigInt(c.x) - BigInt(a.x);
  const acy = BigInt(c.y) - BigInt(a.y);
  return abx * acy - aby * acx;
}

function onSegment(a: Point2, b: Point2, p: Point2): boolean {
  return (
    Math.min(a.x, b.x) <= p.x &&
    p.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= p.y &&
    p.y <= Math.max(a.y, b.y)
  );
}

/** True when the closed segments p1p2 and p3p4 share any point (including touching). */
function segmentsIntersect(p1: Point2, p2: Point2, p3: Point2, p4: Point2): boolean {
  const d1 = orient(p3, p4, p1);
  const d2 = orient(p3, p4, p2);
  const d3 = orient(p1, p2, p3);
  const d4 = orient(p1, p2, p4);

  const straddlesP3P4 = (d1 > 0n && d2 < 0n) || (d1 < 0n && d2 > 0n);
  const straddlesP1P2 = (d3 > 0n && d4 < 0n) || (d3 < 0n && d4 > 0n);
  if (straddlesP3P4 && straddlesP1P2) {
    return true;
  }

  return (
    (d1 === 0n && onSegment(p3, p4, p1)) ||
    (d2 === 0n && onSegment(p3, p4, p2)) ||
    (d3 === 0n && onSegment(p1, p2, p3)) ||
    (d4 === 0n && onSegment(p1, p2, p4))
  );
}

/**
 * A ring is simple when it has at least three distinct vertices, non-zero area, and no two
 * non-adjacent edges intersect (including touching at a point or overlapping collinearly).
 */
export function isSimpleRing(ring: readonly Point2[]): boolean {
  const n = ring.length;
  if (n < 3) {
    return false;
  }

  // Reject repeated vertices that are not adjacent (a bow-tie closing back on itself).
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const adjacent = j === (i + 1) % n || i === (j + 1) % n;
      if (adjacent) {
        continue;
      }
      const a = ring[i];
      const b = ring[j];
      if (a !== undefined && b !== undefined && a.x === b.x && a.y === b.y) {
        return false;
      }
    }
  }

  if (signedArea2(ring) === 0) {
    return false;
  }

  for (let i = 0; i < n; i += 1) {
    const a1 = ring[i];
    const a2 = ring[(i + 1) % n];
    if (a1 === undefined || a2 === undefined) {
      continue;
    }
    for (let j = i + 1; j < n; j += 1) {
      const adjacent = j === (i + 1) % n || i === (j + 1) % n;
      if (adjacent) {
        continue;
      }
      const b1 = ring[j];
      const b2 = ring[(j + 1) % n];
      if (b1 === undefined || b2 === undefined) {
        continue;
      }
      if (segmentsIntersect(a1, a2, b1, b2)) {
        return false;
      }
    }
  }

  return true;
}
