import { describe, expect, it } from 'vitest';

import { canonicalJson, type Ring2, type SceneDoc } from '@overlord/scene';

import { createHistory } from '../src/history.js';
import type { ApplyContext } from '../src/apply.js';
import type { Command } from '../src/types.js';
import { makeCtx, makeScene } from './fixtures.js';

/** Deterministic PRNG so a failing sequence is reproducible. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PROVENANCES = ['STATED', 'ARCHETYPE', 'MEASURED', 'INFERRED'] as const;
const ZONE_KINDS = ['AUDIENCE', 'BACKSTAGE', 'FNB', 'VIP', 'PARKING', 'CIRCULATION', 'OTHER'] as const;

function randomCommand(doc: SceneDoc, ctx: ApplyContext, rand: () => number): Command {
  const int = (min: number, max: number): number => min + Math.floor(rand() * (max - min + 1));
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)] as T;

  const choices = ['ADD_ELEMENT', 'SET_SCENE_NAME', 'SET_SITE_ANCHOR', 'ADD_ZONE'];
  if (doc.elements.length > 0) {
    choices.push('MOVE_ABS', 'MOVE_REL', 'ROTATE', 'RESIZE', 'LABEL', 'DELETE_ELEMENT');
  }
  if (doc.zones.length > 0) {
    choices.push('SET_ZONE_RING', 'DELETE_ZONE');
  }

  // A CCW rectangle: bottom-left, bottom-right, top-right, top-left.
  const ccwRect = (): Ring2 => {
    const x = int(-100000, 100000);
    const y = int(-100000, 100000);
    const w = int(10000, 100000);
    const h = int(10000, 100000);
    return [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ] as unknown as Ring2;
  };

  const randomElement = () => pick(doc.elements);
  const randomZone = () => pick(doc.zones);

  switch (pick(choices)) {
    case 'ADD_ELEMENT': {
      const typeCode = pick([...ctx.registry.keys()]);
      return {
        type: 'ADD_ELEMENT',
        typeCode,
        center: { x: int(-200000, 200000), y: int(-200000, 200000), z: int(0, 50000) } as never,
        provenance: pick(PROVENANCES),
      };
    }
    case 'SET_SCENE_NAME':
      return { type: 'SET_SCENE_NAME', name: `Scene ${int(1, 9999)}` };
    case 'SET_SITE_ANCHOR': {
      const current = doc.site.anchor.value;
      return {
        type: 'SET_SITE_ANCHOR',
        anchor: {
          latDeg: Math.min(90, Math.max(-90, current.latDeg + int(-1, 1) / 100)),
          lonDeg: Math.min(180, Math.max(-180, current.lonDeg + int(-1, 1) / 100)),
          heightM: int(0, 50),
          headingDeg: int(0, 359),
        },
      };
    }
    case 'ADD_ZONE':
      return { type: 'ADD_ZONE', kind: pick(ZONE_KINDS), label: `Zone ${int(1, 9999)}`, ring: ccwRect() };
    case 'MOVE_ABS': {
      const target = randomElement();
      return {
        type: 'MOVE_ELEMENT_ABSOLUTE',
        id: target.id,
        center: { x: int(-200000, 200000), y: int(-200000, 200000), z: int(0, 50000) } as never,
      };
    }
    case 'MOVE_REL': {
      const target = randomElement();
      return {
        type: 'MOVE_ELEMENT_RELATIVE',
        id: target.id,
        delta: { x: int(-20, 20) * 1000, y: int(-20, 20) * 1000 } as never,
      };
    }
    case 'ROTATE':
      return { type: 'ROTATE_ELEMENT', id: randomElement().id, rotationDeg: int(-10, 730) };
    case 'RESIZE': {
      const target = randomElement();
      const definition = ctx.registry.get(target.typeCode);
      if (definition === undefined) {
        return { type: 'SET_SCENE_NAME', name: 'fallback' };
      }
      return {
        type: 'RESIZE_ELEMENT',
        id: target.id,
        size: {
          x: int(definition.minSize.x, definition.maxSize.x),
          y: int(definition.minSize.y, definition.maxSize.y),
          z: int(definition.minSize.z, definition.maxSize.z),
        } as never,
      };
    }
    case 'LABEL':
      return { type: 'SET_ELEMENT_LABEL', id: randomElement().id, label: `Label ${int(1, 9999)}` };
    case 'DELETE_ELEMENT':
      return { type: 'DELETE_ELEMENT', id: randomElement().id };
    case 'SET_ZONE_RING':
      return { type: 'SET_ZONE_RING', id: randomZone().id, ring: ccwRect() };
    case 'DELETE_ZONE':
      return { type: 'DELETE_ZONE', id: randomZone().id };
    default:
      return { type: 'SET_SCENE_NAME', name: 'fallback' };
  }
}

describe('20-command round-trip property', () => {
  it('applying 20 random valid commands then undoing all of them restores the original document', () => {
    const original = makeScene();
    const ctx = makeCtx('rt');
    const history = createHistory(original);
    const rand = mulberry32(20260923);

    let applied = 0;
    let attempts = 0;
    while (applied < 20 && attempts < 500) {
      attempts += 1;
      const result = history.run(randomCommand(history.current(), ctx, rand), ctx);
      if (result.ok) {
        applied += 1;
      }
    }

    expect(applied).toBe(20);
    expect(history.depth()).toBe(20);

    while (history.canUndo()) {
      expect(history.undo()).toBe(true);
    }

    expect(canonicalJson(history.current())).toBe(canonicalJson(original));
  });
});
