import { describe, expect, it } from 'vitest';

import { canonicalJson, type Ring2, type SceneDoc } from '@overlord/scene';

import { applyCommand as attemptCommand, applyCommands } from '../src/apply.js';
import type { Command } from '../src/types.js';
import { element, elementTypeRegistry, makeCtx, makeScene, zone } from './fixtures.js';

function def(code: string) {
  const found = elementTypeRegistry.get(code);
  if (found === undefined) {
    throw new Error(`missing type ${code}`);
  }
  return found;
}

function point(x: number, y: number, z = 0): never {
  return { x, y, z } as never;
}

function cwRing(x: number, y: number, w: number, h: number): Ring2 {
  // Clockwise (invalid for a zone ring).
  return [
    { x, y },
    { x, y: y + h },
    { x: x + w, y: y + h },
    { x: x + w, y },
  ] as unknown as Ring2;
}

function ccwRing(x: number, y: number, w: number, h: number): Ring2 {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ] as unknown as Ring2;
}

function bowTie(): Ring2 {
  return [
    { x: 0, y: 0 },
    { x: 1000, y: 1000 },
    { x: 1000, y: 0 },
    { x: 0, y: 1000 },
  ] as unknown as Ring2;
}

/** Apply a command that must succeed, returning the new doc and inverse. */
/** Apply a command with a throwaway context (for the negative cases). */
function attempt(doc: SceneDoc, command: Command, ctx = makeCtx('attempt')) {
  return attemptCommand(doc, command, ctx);
}

function must(doc: SceneDoc, command: Command, ctx = makeCtx()): { doc: SceneDoc; inverse: Command } {
  const result = attempt(doc, command, ctx);
  if (!result.ok) {
    throw new Error(`expected ok, got ${result.error.code}: ${result.error.message}`);
  }
  return { doc: result.doc, inverse: result.inverse };
}

describe('ADD_ELEMENT', () => {
  it('defaults size, label numbering, id and provenance', () => {
    const ctx = makeCtx('e');
    const { doc, inverse } = must(
      makeScene(),
      { type: 'ADD_ELEMENT', typeCode: 'FOOD_STALL', center: point(10000, 20000), provenance: 'STATED' },
      ctx,
    );
    const added = element(doc, 'e_1');
    expect(added.label).toBe('Food stall 1');
    expect(added.size.value).toEqual(def('FOOD_STALL').defaultSize);
    expect(added.placement.value.rotationDeg).toBe(0);
    expect(added.placement.provenance).toBe('STATED');
    expect(added.params).toEqual({});
    expect(inverse).toEqual({ type: 'DELETE_ELEMENT', id: 'e_1' });

    const second = must(
      doc,
      { type: 'ADD_ELEMENT', typeCode: 'FOOD_STALL', center: point(30000, 20000), provenance: 'STATED' },
      ctx,
    );
    expect(element(second.doc, 'e_2').label).toBe('Food stall 2');
  });

  it('honours explicit id, label, size and normalises rotation', () => {
    const { doc, inverse } = must(makeScene(), {
      type: 'ADD_ELEMENT',
      typeCode: 'RISER',
      id: 'riser_x',
      label: 'Riser X',
      center: point(0, 5000, 1000),
      rotationDeg: 370,
      size: { x: 8000, y: 8000, z: 4000 } as never,
      provenance: 'STATED',
    });
    const added = element(doc, 'riser_x');
    expect(added.label).toBe('Riser X');
    expect(added.placement.value.rotationDeg).toBe(10);
    expect(inverse).toEqual({ type: 'DELETE_ELEMENT', id: 'riser_x' });
  });

  it('rejects an unknown type', () => {
    const result = attempt(makeScene(), {
      type: 'ADD_ELEMENT',
      typeCode: 'NOPE',
      center: point(0, 0),
      provenance: 'STATED',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('UNKNOWN_TYPE');
  });

  it('rejects a size out of bounds', () => {
    const result = attempt(makeScene(), {
      type: 'ADD_ELEMENT',
      typeCode: 'FOOD_STALL',
      center: point(0, 0),
      size: { x: 9_999_999, y: 1000, z: 1000 } as never,
      provenance: 'STATED',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('SIZE_OUT_OF_BOUNDS');
  });

  it('rejects a duplicate id', () => {
    const result = attempt(makeScene(), {
      type: 'ADD_ELEMENT',
      typeCode: 'RISER',
      id: 'main_stage',
      center: point(0, 0),
      provenance: 'STATED',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('DUPLICATE_ID');
  });
});

describe('element field commands', () => {
  it('MOVE_ELEMENT_ABSOLUTE sets STATED and its inverse restores provenance exactly', () => {
    const before = makeScene();
    const { doc, inverse } = must(before, {
      type: 'MOVE_ELEMENT_ABSOLUTE',
      id: 'main_stage',
      center: point(5000, 6000, 9144),
    });
    const moved = element(doc, 'main_stage');
    expect(moved.placement.value.center).toEqual({ x: 5000, y: 6000, z: 9144 });
    expect(moved.placement.provenance).toBe('STATED');
    const undone = must(doc, inverse);
    expect(canonicalJson(undone.doc)).toBe(canonicalJson(before));
  });

  it('MOVE_ELEMENT_RELATIVE adds the delta (z defaults to 0) and the inverse subtracts it', () => {
    const before = makeScene();
    const start = element(before, 'main_stage').placement.value.center;
    const { doc, inverse } = must(before, {
      type: 'MOVE_ELEMENT_RELATIVE',
      id: 'main_stage',
      delta: { x: 1000, y: -2000 } as never,
    });
    const moved = element(doc, 'main_stage').placement.value.center;
    expect(moved).toEqual({ x: start.x + 1000, y: start.y - 2000, z: start.z });
    expect(canonicalJson(must(doc, inverse).doc)).toBe(canonicalJson(before));
  });

  it('ROTATE_ELEMENT normalises and the inverse restores', () => {
    const before = makeScene();
    const { doc, inverse } = must(before, { type: 'ROTATE_ELEMENT', id: 'main_stage', rotationDeg: 370 });
    expect(element(doc, 'main_stage').placement.value.rotationDeg).toBe(10);
    expect(canonicalJson(must(doc, inverse).doc)).toBe(canonicalJson(before));
  });

  it('RESIZE_ELEMENT checks bounds and the inverse restores', () => {
    const before = makeScene();
    const { doc, inverse } = must(before, {
      type: 'RESIZE_ELEMENT',
      id: 'main_stage',
      size: { x: 30000, y: 30000, z: 5000 } as never,
    });
    expect(element(doc, 'main_stage').size.value).toEqual({ x: 30000, y: 30000, z: 5000 });
    expect(canonicalJson(must(doc, inverse).doc)).toBe(canonicalJson(before));

    const bad = attempt(before, {
      type: 'RESIZE_ELEMENT',
      id: 'main_stage',
      size: { x: 9_999_999, y: 15000, z: 4000 } as never,
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe('SIZE_OUT_OF_BOUNDS');
  });

  it('DELETE_ELEMENT round-trips exactly through its inverse', () => {
    const before = makeScene();
    const { doc, inverse } = must(before, { type: 'DELETE_ELEMENT', id: 'green_room_2' });
    expect(doc.elements.some((candidate) => candidate.id === 'green_room_2')).toBe(false);
    expect(canonicalJson(must(doc, inverse).doc)).toBe(canonicalJson(before));
  });

  it('SET_ELEMENT_LABEL round-trips exactly', () => {
    const before = makeScene();
    const { doc, inverse } = must(before, { type: 'SET_ELEMENT_LABEL', id: 'main_stage', label: 'Renamed' });
    expect(element(doc, 'main_stage').label).toBe('Renamed');
    expect(canonicalJson(must(doc, inverse).doc)).toBe(canonicalJson(before));
  });

  it('reports ELEMENT_NOT_FOUND', () => {
    const result = attempt(makeScene(), {
      type: 'MOVE_ELEMENT_ABSOLUTE',
      id: 'nope',
      center: point(0, 0),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('ELEMENT_NOT_FOUND');
  });
});

describe('zone commands', () => {
  it('ADD_ZONE adds a STATED zone and its inverse deletes it', () => {
    const { doc, inverse } = must(makeScene(), {
      type: 'ADD_ZONE',
      kind: 'FNB',
      label: 'Food court',
      ring: ccwRing(40000, 40000, 20000, 20000),
    });
    expect(inverse.type).toBe('DELETE_ZONE');
    if (inverse.type === 'DELETE_ZONE') {
      expect(zone(doc, inverse.id).label).toBe('Food court');
      expect(zone(doc, inverse.id).ring.provenance).toBe('STATED');
    }
  });

  it('SET_ZONE_RING round-trips exactly (restores ARCHETYPE provenance)', () => {
    const before = makeScene();
    const { doc, inverse } = must(before, {
      type: 'SET_ZONE_RING',
      id: 'audience_zone',
      ring: ccwRing(-1000, 1000, 5000, 5000),
    });
    expect(canonicalJson(must(doc, inverse).doc)).toBe(canonicalJson(before));
  });

  it('DELETE_ZONE round-trips exactly through its inverse', () => {
    const before = makeScene();
    const { doc, inverse } = must(before, { type: 'DELETE_ZONE', id: 'audience_zone' });
    expect(doc.zones).toHaveLength(0);
    expect(canonicalJson(must(doc, inverse).doc)).toBe(canonicalJson(before));
  });

  it('rejects invalid rings with RING_INVALID', () => {
    const cases: Ring2[] = [
      [{ x: 0, y: 0 }, { x: 1000, y: 0 }] as unknown as Ring2,
      bowTie(),
      cwRing(0, 0, 1000, 1000),
    ];
    for (const ring of cases) {
      const result = attempt(makeScene(), { type: 'ADD_ZONE', kind: 'OTHER', label: 'x', ring });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('RING_INVALID');
    }
    const setResult = attempt(makeScene(), { type: 'SET_ZONE_RING', id: 'audience_zone', ring: bowTie() });
    expect(setResult.ok).toBe(false);
    if (!setResult.ok) expect(setResult.error.code).toBe('RING_INVALID');
  });

  it('rejects a duplicate zone id and reports ZONE_NOT_FOUND', () => {
    const dup = attempt(makeScene(), {
      type: 'ADD_ZONE',
      kind: 'OTHER',
      label: 'x',
      id: 'audience_zone',
      ring: ccwRing(0, 0, 1000, 1000),
    });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error.code).toBe('DUPLICATE_ID');

    const missing = attempt(makeScene(), {
      type: 'DELETE_ZONE',
      id: 'nope',
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe('ZONE_NOT_FOUND');
  });
});

describe('site and scene commands', () => {
  it('SET_SITE_ANCHOR round-trips exactly and rejects an invalid anchor', () => {
    const before = makeScene();
    const { doc, inverse } = must(before, {
      type: 'SET_SITE_ANCHOR',
      anchor: { latDeg: 22.6, lonDeg: 88.4, heightM: 5, headingDeg: 90 },
    });
    expect(doc.site.anchor.value.latDeg).toBe(22.6);
    expect(doc.site.anchor.provenance).toBe('STATED');
    expect(canonicalJson(must(doc, inverse).doc)).toBe(canonicalJson(before));

    const invalid = attempt(before, {
      type: 'SET_SITE_ANCHOR',
      anchor: { latDeg: 999, lonDeg: 88.4, heightM: 0, headingDeg: 0 },
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error.code).toBe('WOULD_INVALIDATE');
  });

  it('SET_SCENE_NAME round-trips exactly', () => {
    const before = makeScene();
    const { doc, inverse } = must(before, { type: 'SET_SCENE_NAME', name: 'Renamed scene' });
    expect(doc.name).toBe('Renamed scene');
    expect(canonicalJson(must(doc, inverse).doc)).toBe(canonicalJson(before));
  });
});

describe('purity and applyCommands', () => {
  it('never mutates the input document', () => {
    const before = makeScene();
    const snapshot = canonicalJson(before);
    must(before, { type: 'SET_SCENE_NAME', name: 'x' });
    must(before, { type: 'ROTATE_ELEMENT', id: 'main_stage', rotationDeg: 45 });
    must(before, { type: 'DELETE_ELEMENT', id: 'green_room_1' });
    expect(canonicalJson(before)).toBe(snapshot);
  });

  it('applyCommands is all-or-nothing and reports the failing index', () => {
    const before = makeScene();
    const result = applyCommands(
      before,
      [
        { type: 'SET_SCENE_NAME', name: 'First' },
        { type: 'MOVE_ELEMENT_ABSOLUTE', id: 'missing', center: point(0, 0) },
        { type: 'SET_SCENE_NAME', name: 'Third' },
      ],
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.index).toBe(1);
      expect(result.error.code).toBe('ELEMENT_NOT_FOUND');
      expect(canonicalJson(result.doc)).toBe(canonicalJson(before));
    }
  });

  it('applyCommands returns the inverses of every applied command', () => {
    const result = applyCommands(
      makeScene(),
      [
        { type: 'SET_SCENE_NAME', name: 'A' },
        { type: 'ROTATE_ELEMENT', id: 'main_stage', rotationDeg: 90 },
      ],
      makeCtx(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.inverses).toHaveLength(2);
    }
  });
});
