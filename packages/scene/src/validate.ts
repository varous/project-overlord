/**
 * Scene document validation. Collects every issue; never stops at the first.
 */

import { isSimpleRing, signedArea2 } from '@overlord/geo-core';

import type { ElementTypeRegistry } from './registry.js';
import type { Ring2, SceneDoc } from './types.js';

export type IssueCode =
  | 'SCHEMA_VERSION'
  | 'DUPLICATE_ID'
  | 'UNKNOWN_TYPE'
  | 'UNSAFE_INTEGER'
  | 'RING_NOT_SIMPLE'
  | 'RING_NOT_CCW'
  | 'RING_TOO_FEW_POINTS'
  | 'SIZE_OUT_OF_BOUNDS'
  | 'GEOMETRY_MISMATCH'
  | 'MISSING_PROVENANCE'
  | 'SITE_TOO_LARGE'
  | 'ANCHOR_INVALID';

export interface Issue {
  code: IssueCode;
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: Issue[];
}

const PROVENANCES = new Set(['STATED', 'ARCHETYPE', 'MEASURED', 'INFERRED']);
const MAX_SITE_TMM = 5 * 1000 * 10000; // 5 km in tmm
const MAX_SITE_SQUARED = BigInt(MAX_SITE_TMM) * BigInt(MAX_SITE_TMM);

function isSafeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function checkInteger(value: unknown, path: string, issues: Issue[]): value is number {
  if (!isSafeInt(value)) {
    issues.push({ code: 'UNSAFE_INTEGER', path, message: `${path} must be a safe integer` });
    return false;
  }
  return true;
}

function checkProvenance(value: unknown, path: string, issues: Issue[]): void {
  if (typeof value !== 'object' || value === null) {
    issues.push({ code: 'MISSING_PROVENANCE', path, message: `${path} must be a sourced value` });
    return;
  }
  const provenance = (value as { provenance?: unknown }).provenance;
  if (typeof provenance !== 'string' || !PROVENANCES.has(provenance)) {
    issues.push({ code: 'MISSING_PROVENANCE', path: `${path}.provenance`, message: `${path} has no valid provenance` });
  }
}

function checkDistance(x: number, y: number, z: number, path: string, issues: Issue[]): void {
  const bx = BigInt(x);
  const by = BigInt(y);
  const bz = BigInt(z);
  if (bx * bx + by * by + bz * bz > MAX_SITE_SQUARED) {
    issues.push({ code: 'SITE_TOO_LARGE', path, message: `${path} is farther than 5 km from the origin` });
  }
}

function checkLocalPoint(value: unknown, path: string, issues: Issue[]): void {
  if (typeof value !== 'object' || value === null) {
    issues.push({ code: 'UNSAFE_INTEGER', path, message: `${path} must be a local point` });
    return;
  }
  const point = value as Record<string, unknown>;
  const x = point.x;
  const y = point.y;
  const z = point.z;
  const xOk = checkInteger(x, `${path}.x`, issues);
  const yOk = checkInteger(y, `${path}.y`, issues);
  const zOk = checkInteger(z, `${path}.z`, issues);
  if (xOk && yOk && zOk) {
    checkDistance(x, y, z, path, issues);
  }
}

function checkRing(value: unknown, path: string, issues: Issue[]): void {
  if (!Array.isArray(value) || value.length < 3) {
    issues.push({ code: 'RING_TOO_FEW_POINTS', path, message: `${path} must have at least 3 points` });
    return;
  }
  let allIntegers = true;
  for (const [index, point] of value.entries()) {
    if (typeof point !== 'object' || point === null) {
      allIntegers = false;
      issues.push({ code: 'UNSAFE_INTEGER', path: `${path}[${index}]`, message: `${path}[${index}] must be a point` });
      continue;
    }
    const record = point as Record<string, unknown>;
    const x = record.x;
    const y = record.y;
    const xOk = checkInteger(x, `${path}[${index}].x`, issues);
    const yOk = checkInteger(y, `${path}[${index}].y`, issues);
    allIntegers = allIntegers && xOk && yOk;
    if (xOk && yOk) {
      checkDistance(x, y, 0, `${path}[${index}]`, issues);
    }
  }
  if (!allIntegers) {
    return;
  }
  const ring = value as Ring2;
  if (!isSimpleRing(ring)) {
    issues.push({ code: 'RING_NOT_SIMPLE', path, message: `${path} is not a simple ring` });
  }
  if (signedArea2(ring) <= 0) {
    issues.push({ code: 'RING_NOT_CCW', path, message: `${path} must be counter-clockwise` });
  }
}

export function validateScene(doc: SceneDoc, registry: ElementTypeRegistry): ValidationResult {
  const issues: Issue[] = [];

  if (doc.schemaVersion !== 1) {
    issues.push({
      code: 'SCHEMA_VERSION',
      path: 'schemaVersion',
      message: `schemaVersion must be 1, got ${String(doc.schemaVersion)}`,
    });
  }

  // Duplicate ids across elements, zones and viewpoints.
  const seen = new Map<string, string>();
  const registerId = (id: unknown, path: string): void => {
    if (typeof id !== 'string' || id.length === 0) {
      return;
    }
    const previous = seen.get(id);
    if (previous !== undefined) {
      issues.push({ code: 'DUPLICATE_ID', path, message: `id "${id}" is already used at ${previous}` });
    } else {
      seen.set(id, path);
    }
  };

  checkProvenance(doc.site.anchor, 'site.anchor', issues);
  const anchorValue = (doc.site.anchor as { value?: unknown } | null | undefined)?.value;
  if (typeof anchorValue !== 'object' || anchorValue === null) {
    issues.push({ code: 'ANCHOR_INVALID', path: 'site.anchor.value', message: 'site anchor value is required' });
  } else {
    const anchor = anchorValue as Record<string, unknown>;
    if (typeof anchor.latDeg !== 'number' || anchor.latDeg < -90 || anchor.latDeg > 90) {
      issues.push({ code: 'ANCHOR_INVALID', path: 'site.anchor.value.latDeg', message: 'latDeg must be in [-90, 90]' });
    }
    if (typeof anchor.lonDeg !== 'number' || anchor.lonDeg < -180 || anchor.lonDeg > 180) {
      issues.push({ code: 'ANCHOR_INVALID', path: 'site.anchor.value.lonDeg', message: 'lonDeg must be in [-180, 180]' });
    }
    if (typeof anchor.headingDeg !== 'number' || anchor.headingDeg < 0 || anchor.headingDeg >= 360) {
      issues.push({ code: 'ANCHOR_INVALID', path: 'site.anchor.value.headingDeg', message: 'headingDeg must be in [0, 360)' });
    }
  }

  if (doc.site.boundary !== null) {
    checkProvenance(doc.site.boundary, 'site.boundary', issues);
    checkRing((doc.site.boundary as { value?: unknown }).value, 'site.boundary.value', issues);
  }

  for (const [index, element] of doc.elements.entries()) {
    const path = `elements[${index}]`;
    registerId(element.id, `${path}.id`);

    const type = registry.get(element.typeCode);
    if (type === undefined) {
      issues.push({ code: 'UNKNOWN_TYPE', path: `${path}.typeCode`, message: `unknown element type "${element.typeCode}"` });
    }

    checkProvenance(element.placement, `${path}.placement`, issues);
    checkProvenance(element.size, `${path}.size`, issues);

    const placement = (element.placement as { value?: unknown } | null | undefined)?.value;
    if (typeof placement === 'object' && placement !== null) {
      const record = placement as Record<string, unknown>;
      checkLocalPoint(record.center, `${path}.placement.value.center`, issues);
      if (typeof record.rotationDeg !== 'number' || !Number.isFinite(record.rotationDeg)) {
        issues.push({ code: 'UNSAFE_INTEGER', path: `${path}.placement.value.rotationDeg`, message: 'rotationDeg must be finite' });
      }
    }

    const size = (element.size as { value?: unknown } | null | undefined)?.value;
    if (typeof size === 'object' && size !== null) {
      const record = size as Record<string, unknown>;
      const xOk = checkInteger(record.x, `${path}.size.value.x`, issues);
      const yOk = checkInteger(record.y, `${path}.size.value.y`, issues);
      const zOk = checkInteger(record.z, `${path}.size.value.z`, issues);
      if (xOk && yOk && zOk && type !== undefined) {
        if (type.geometry === 'FLAT' && record.z !== 0) {
          issues.push({ code: 'GEOMETRY_MISMATCH', path: `${path}.size.value.z`, message: `FLAT type ${type.code} must have z = 0` });
        }
        if (type.geometry === 'BOX' && record.z === 0) {
          issues.push({ code: 'GEOMETRY_MISMATCH', path: `${path}.size.value.z`, message: `BOX type ${type.code} must have z != 0` });
        }
        for (const axis of ['x', 'y', 'z'] as const) {
          const value = record[axis];
          if (typeof value === 'number' && (value < type.minSize[axis] || value > type.maxSize[axis])) {
            issues.push({
              code: 'SIZE_OUT_OF_BOUNDS',
              path: `${path}.size.value.${axis}`,
              message: `${type.code}.${axis} must be within [${type.minSize[axis]}, ${type.maxSize[axis]}] tmm`,
            });
          }
        }
      }
    }

    for (const [key, sourced] of Object.entries(element.params ?? {})) {
      checkProvenance(sourced, `${path}.params.${key}`, issues);
      const value = (sourced as { value?: unknown } | null | undefined)?.value;
      if (typeof value === 'number' && !Number.isSafeInteger(value)) {
        issues.push({ code: 'UNSAFE_INTEGER', path: `${path}.params.${key}.value`, message: 'numeric params must be safe integers' });
      }
    }
  }

  for (const [index, zone] of doc.zones.entries()) {
    const path = `zones[${index}]`;
    registerId(zone.id, `${path}.id`);
    checkProvenance(zone.ring, `${path}.ring`, issues);
    checkRing((zone.ring as { value?: unknown })?.value, `${path}.ring.value`, issues);
  }

  for (const [index, viewpoint] of doc.viewpoints.entries()) {
    const path = `viewpoints[${index}]`;
    registerId(viewpoint.id, `${path}.id`);
    checkLocalPoint(viewpoint.eye, `${path}.eye`, issues);
    checkLocalPoint(viewpoint.target, `${path}.target`, issues);
  }

  return { ok: issues.length === 0, issues };
}
