import { describe, expect, it } from 'vitest';

import { elementTypeRegistry, validateScene, type IssueCode, type Ring2 } from '../src/index.js';
import { makeScene } from './fixtures.js';

function codes(issues: { code: string }[]): string[] {
  return issues.map((issue) => issue.code);
}

function expectCode(issues: { code: string }[], code: IssueCode): void {
  expect(codes(issues)).toContain(code);
}

describe('validateScene', () => {
  it('accepts the demo scene', () => {
    const result = validateScene(makeScene(), elementTypeRegistry);
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('reports SCHEMA_VERSION', () => {
    const doc = makeScene();
    (doc as unknown as { schemaVersion: number }).schemaVersion = 2;
    const result = validateScene(doc, elementTypeRegistry);
    expectCode(result.issues, 'SCHEMA_VERSION');
  });

  it('reports DUPLICATE_ID across collections', () => {
    const doc = makeScene();
    const zone = doc.zones[0];
    if (zone === undefined) {
      throw new Error('missing zone');
    }
    doc.zones.push({ ...zone, id: doc.elements[0]?.id ?? 'main_stage' });
    const result = validateScene(doc, elementTypeRegistry);
    expectCode(result.issues, 'DUPLICATE_ID');
  });

  it('reports UNKNOWN_TYPE', () => {
    const doc = makeScene();
    if (doc.elements[0] !== undefined) {
      doc.elements[0].typeCode = 'NOT_A_TYPE';
    }
    expectCode(validateScene(doc, elementTypeRegistry).issues, 'UNKNOWN_TYPE');
  });

  it('reports UNSAFE_INTEGER', () => {
    const doc = makeScene();
    if (doc.elements[0] !== undefined) {
      (doc.elements[0].size.value as { x: number }).x = 1.5;
    }
    expectCode(validateScene(doc, elementTypeRegistry).issues, 'UNSAFE_INTEGER');
  });

  it('reports RING_NOT_SIMPLE', () => {
    const doc = makeScene();
    const bowTie = [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
    ] as unknown as Ring2;
    if (doc.zones[0] !== undefined) {
      doc.zones[0].ring.value = bowTie;
    }
    expectCode(validateScene(doc, elementTypeRegistry).issues, 'RING_NOT_SIMPLE');
  });

  it('reports RING_NOT_CCW', () => {
    const doc = makeScene();
    if (doc.zones[0] !== undefined) {
      doc.zones[0].ring.value = [...doc.zones[0].ring.value].reverse();
    }
    expectCode(validateScene(doc, elementTypeRegistry).issues, 'RING_NOT_CCW');
  });

  it('reports RING_TOO_FEW_POINTS', () => {
    const doc = makeScene();
    if (doc.zones[0] !== undefined) {
      doc.zones[0].ring.value = doc.zones[0].ring.value.slice(0, 2);
    }
    expectCode(validateScene(doc, elementTypeRegistry).issues, 'RING_TOO_FEW_POINTS');
  });

  it('reports SIZE_OUT_OF_BOUNDS', () => {
    const doc = makeScene();
    if (doc.elements[0] !== undefined) {
      (doc.elements[0].size.value as { x: number }).x = 1_000_000;
    }
    expectCode(validateScene(doc, elementTypeRegistry).issues, 'SIZE_OUT_OF_BOUNDS');
  });

  it('reports GEOMETRY_MISMATCH for a BOX with z = 0', () => {
    const doc = makeScene();
    if (doc.elements[0] !== undefined) {
      (doc.elements[0].size.value as { z: number }).z = 0;
    }
    expectCode(validateScene(doc, elementTypeRegistry).issues, 'GEOMETRY_MISMATCH');
  });

  it('reports MISSING_PROVENANCE', () => {
    const doc = makeScene();
    if (doc.elements[0] !== undefined) {
      Reflect.deleteProperty(doc.elements[0].size, 'provenance');
    }
    expectCode(validateScene(doc, elementTypeRegistry).issues, 'MISSING_PROVENANCE');
  });

  it('reports SITE_TOO_LARGE', () => {
    const doc = makeScene();
    if (doc.elements[0] !== undefined) {
      (doc.elements[0].placement.value.center as { x: number }).x = 60_000_000;
    }
    expectCode(validateScene(doc, elementTypeRegistry).issues, 'SITE_TOO_LARGE');
  });

  it('reports ANCHOR_INVALID', () => {
    const doc = makeScene();
    (doc.site.anchor.value as { latDeg: number }).latDeg = 100;
    expectCode(validateScene(doc, elementTypeRegistry).issues, 'ANCHOR_INVALID');
  });

  it('collects every issue instead of stopping at the first', () => {
    const doc = makeScene();
    (doc as unknown as { schemaVersion: number }).schemaVersion = 3;
    (doc.site.anchor.value as { headingDeg: number }).headingDeg = 720;
    if (doc.elements[0] !== undefined) {
      doc.elements[0].typeCode = 'NOPE';
      (doc.elements[0].size.value as { x: number }).x = 1.5;
    }
    const result = validateScene(doc, elementTypeRegistry);
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThanOrEqual(4);
    expect(codes(result.issues)).toEqual(
      expect.arrayContaining(['SCHEMA_VERSION', 'ANCHOR_INVALID', 'UNKNOWN_TYPE', 'UNSAFE_INTEGER']),
    );
  });
});
