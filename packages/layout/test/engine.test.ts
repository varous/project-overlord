import { describe, expect, it } from 'vitest';

import { signedArea2 } from '@overlord/geo-core';
import { validateScene, type Ring2, type SceneDoc, type SceneElement } from '@overlord/scene';
import { allArchetypes } from '../src/archetypes.js';
import { normaliseBrief } from '../src/brief.js';
import { applyGeneratedLayout } from '../src/apply.js';
import { EVENT_TYPES, type EventType } from '../src/types.js';
import {
  SITE_ANCHOR,
  canonicalJson,
  elementById,
  elementTypeRegistry,
  generate,
  generateOk,
  yFeet,
} from './fixtures.js';

function rectangle(x0: number, y0: number, x1: number, y1: number): Ring2 {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ] as unknown as Ring2;
}

function footprints(elements: readonly SceneElement[]): { x0: number; y0: number; x1: number; y1: number; id: string }[] {
  return elements.map((element) => ({
    id: element.id,
    x0: element.placement.value.center.x - element.size.value.x / 2,
    x1: element.placement.value.center.x + element.size.value.x / 2,
    y0: element.placement.value.center.y - element.size.value.y / 2,
    y1: element.placement.value.center.y + element.size.value.y / 2,
  }));
}

function intersects(a: { x0: number; y0: number; x1: number; y1: number }, b: { x0: number; y0: number; x1: number; y1: number }): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

describe('determinism', () => {
  it('generates a byte-identical scene across 10 runs and both key orders', () => {
    const brief = { eventType: 'CONCERT' as const, capacity: 5000, days: 2 };
    const reordered = { days: 2, capacity: 5000, eventType: 'CONCERT' as const };
    const hashes = new Set<string>();
    for (let run = 0; run < 10; run += 1) {
      hashes.add(canonicalJson(generateOk(brief).scene));
    }
    hashes.add(canonicalJson(generateOk(reordered).scene));
    expect(hashes.size).toBe(1);
  });

  it('derives ids from the type code and index (no generated ids)', () => {
    const scene = generateOk({ eventType: 'CONCERT', capacity: 5000 }).scene;
    for (const element of scene.elements) {
      expect(element.id).toMatch(/^gen_[a-z_]+_\d+$/);
    }
    expect(elementById(scene.elements, 'gen_food_stall_1').label).toBe('Food stall 1');
  });
});

describe('capacity', () => {
  it('gives a 2,000 m² audience for 5,000 people at 2.5/m²', () => {
    const result = generateOk({ eventType: 'CONCERT', capacity: 5000 });
    expect(result.capacity.statedDensity).toBe(2.5);
    // Within one tmm rounding step of the exact 2,000 m².
    expect(Math.abs(result.capacity.netStandingAreaM2 - 2000)).toBeLessThan(0.01);
    expect(Math.abs(result.capacity.impliedCapacity - 5000)).toBeLessThan(1);
  });

  it('emits an audience rectangle whose area matches within one tmm rounding step', () => {
    const scene = generateOk({ eventType: 'CONCERT', capacity: 5000 }).scene;
    const zone = scene.zones.find((candidate) => candidate.kind === 'AUDIENCE');
    expect(zone).toBeDefined();
    if (zone === undefined) {
      return;
    }
    const areaM2 = signedArea2(zone.ring.value) / 2 / 1e8;
    expect(Math.abs(areaM2 - 2000)).toBeLessThan(0.1);
  });
});

describe('corpus depth order (CONCERT)', () => {
  it('orders green rooms < stage < console < bars/food < entry', () => {
    const scene = generateOk({ eventType: 'CONCERT', capacity: 5000 }).scene;
    const green = yFeet(elementById(scene.elements, 'gen_green_room_1'));
    const stage = yFeet(elementById(scene.elements, 'gen_main_stage_1'));
    const consoleRiser = yFeet(elementById(scene.elements, 'gen_console_riser_1'));
    const bars = yFeet(elementById(scene.elements, 'gen_bar_counter_1'));
    const food = yFeet(elementById(scene.elements, 'gen_food_stall_1'));
    const entry = yFeet(elementById(scene.elements, 'gen_entry_gate_1'));

    expect(green).toBeLessThan(stage);
    expect(stage).toBeLessThan(consoleRiser);
    expect(consoleRiser).toBeLessThan(bars);
    expect(bars).toBeLessThan(entry);
    expect(consoleRiser).toBeLessThan(food);
    expect(food).toBeLessThan(entry);
  });
});

describe('repair', () => {
  for (const capacity of [500, 2000, 10000, 50000]) {
    it(`leaves no intersecting footprints at capacity ${capacity}`, () => {
      const scene = generateOk({ eventType: 'CONCERT', capacity }).scene;
      const boxes = footprints(scene.elements);
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i];
          const b = boxes[j];
          if (a !== undefined && b !== undefined) {
            expect(intersects(a, b), `${a.id} intersects ${b.id} at ${capacity}`).toBe(false);
          }
        }
      }
    });
  }

  it('keeps everything inside a boundary and lists the drops', () => {
    const boundary = rectangle(-80000, -80000, 80000, 200000); // ~800 x 920 ft around the site origin
    const result = generateOk({ eventType: 'CONCERT', capacity: 5000, siteBoundary: boundary });
    const inside = (element: SceneElement): boolean => {
      const xs = [element.placement.value.center.x - element.size.value.x / 2, element.placement.value.center.x + element.size.value.x / 2];
      const ys = [element.placement.value.center.y - element.size.value.y / 2, element.placement.value.center.y + element.size.value.y / 2];
      return (
        Math.min(...xs) >= -80000 &&
        Math.max(...xs) <= 80000 &&
        Math.min(...ys) >= -80000 &&
        Math.max(...ys) <= 200000
      );
    };
    expect(result.scene.elements.every(inside)).toBe(true);
    const dropNotes = result.notes.filter((note) => note.startsWith('could not place'));
    expect(dropNotes.length).toBeGreaterThan(0);
    expect(dropNotes[0]).toMatch(/could not place \d+ .+ inside the boundary/);
  });

  it('places everything when there is no boundary', () => {
    const result = generateOk({ eventType: 'CONCERT', capacity: 5000 });
    expect(result.notes.filter((note) => note.startsWith('could not place'))).toHaveLength(0);
    expect(result.scene.elements.length).toBeGreaterThan(20);
  });
});

describe('provenance', () => {
  it('marks a stated stage size STATED and everything else not STATED', () => {
    const stated = generateOk({
      eventType: 'CONCERT',
      capacity: 5000,
      stageSize: { x: 100 * 3048, y: 60 * 3048, z: 8 * 3048 } as never,
    }).scene;
    const stage = elementById(stated.elements, 'gen_main_stage_1');
    expect(stage.size.provenance).toBe('STATED');
    expect(stage.size.value).toEqual({ x: 100 * 3048, y: 60 * 3048, z: 8 * 3048 });

    const defaults = generateOk({ eventType: 'CONCERT', capacity: 5000 }).scene;
    const defaultStage = elementById(defaults.elements, 'gen_main_stage_1');
    expect(defaultStage.size.provenance).toBe('ARCHETYPE');
    for (const element of defaults.elements) {
      expect(element.size.provenance).not.toBe('STATED');
      expect(element.placement.provenance).toBe('INFERRED');
    }
    for (const zone of defaults.zones) {
      expect(zone.ring.provenance).not.toBe('STATED');
    }
  });

  it('keeps the stated brief fields STATED in the normalised brief', () => {
    const { brief } = normaliseBrief({ eventType: 'WEDDING', capacity: 300, days: 2, bars: 3 });
    expect(brief.eventType.provenance).toBe('STATED');
    expect(brief.capacity.provenance).toBe('STATED');
    expect(brief.days?.provenance).toBe('STATED');
    expect(brief.bars?.provenance).toBe('STATED');
    expect(brief.foodStalls?.provenance).toBe('INFERRED');
  });
});

describe('assumptions', () => {
  it('assumes every field the user did not state, each with a reason', () => {
    const { assumptions } = normaliseBrief({ eventType: 'CONCERT', capacity: 5000 });
    const fields = assumptions.map((assumption) => assumption.field);
    expect(fields).not.toContain('eventType');
    expect(fields).not.toContain('capacity');
    expect(fields).toContain('standingDensityPerM2');
    expect(fields).toContain('stageSize');
    expect(fields).toContain('greenRooms');
    expect(fields).toContain('foodStalls');
    expect(fields).toContain('siteBoundary');
    expect(fields).toContain('orientationPreference');
    expect(assumptions.length).toBeGreaterThanOrEqual(15);
    for (const assumption of assumptions) {
      expect(assumption.reason.length).toBeGreaterThan(10);
      expect(['INFERRED', 'ARCHETYPE']).toContain(assumption.provenance);
    }
  });

  it('cites the corpus for green rooms', () => {
    const { assumptions } = normaliseBrief({ eventType: 'CONCERT', capacity: 5000 });
    const greenRooms = assumptions.find((assumption) => assumption.field === 'greenRooms');
    expect(greenRooms?.reason).toContain('27 of 27');
  });
});

describe('archetypes and validity', () => {
  it('has all five archetypes with placement rules', () => {
    const archetypes = allArchetypes();
    expect(archetypes).toHaveLength(5);
    const byEvent = new Map(archetypes.map((archetype) => [archetype.eventType, archetype]));
    for (const eventType of EVENT_TYPES) {
      const archetype = byEvent.get(eventType);
      expect(archetype, eventType).toBeDefined();
      expect(archetype?.rules.length ?? 0).toBeGreaterThan(0);
    }
  });

  for (const eventType of EVENT_TYPES) {
    for (const capacity of [500, 5000, 20000]) {
      it(`produces a valid scene for ${eventType} at ${capacity}`, () => {
        const result = generateOk({ eventType: eventType as EventType, capacity });
        const validation = validateScene(result.scene, elementTypeRegistry);
        expect(validation).toEqual({ ok: true, issues: [] });
      });
    }
  }

  it('returns issues instead of an invalid scene', () => {
    // A capacity of zero produces a degenerate audience rectangle, so the engine must refuse it
    // and hand back the validation issues rather than an invalid scene.
    const result = generate({ eventType: 'CONCERT', capacity: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });
});

describe('applyGeneratedLayout', () => {
  it('produces one REPLACE_CONTENT command carrying the generated elements and zones', () => {
    const generated = generateOk({ eventType: 'CONCERT', capacity: 5000 });
    const emptyDoc: SceneDoc = {
      schemaVersion: 1,
      id: 'scn_test0000000000000',
      name: 'Empty',
      site: { anchor: { value: SITE_ANCHOR, provenance: 'STATED' }, boundary: null, imagery: { provider: 'ESRI', captureDate: null } },
      elements: [],
      zones: [],
      viewpoints: [],
    };
    const command = applyGeneratedLayout(emptyDoc, generated);
    expect(command.type).toBe('REPLACE_CONTENT');
    if (command.type === 'REPLACE_CONTENT') {
      expect(command.elements).toHaveLength(generated.scene.elements.length);
      expect(command.zones).toHaveLength(generated.scene.zones.length);
    }
  });
});
