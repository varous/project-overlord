import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import { elementTypeRegistry, validateScene, type SceneDoc } from '../src/index.js';

function readJson(relative: string): object {
  return JSON.parse(readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')) as object;
}

const ajv = new Ajv2020({ allErrors: true, strict: false });

const v1Schema = readJson('../../../contracts/scene/v1/scene.schema.json');
const v1Example = readJson('../../../contracts/scene/v1/examples/demo-scene.json');
const v2Schema = readJson('../../../contracts/scene/v2/scene.schema.json');
const v2Example = readJson('../../../contracts/scene/v2/examples/demo-scene.json');
const v3Schema = readJson('../../../contracts/scene/v3/scene.schema.json');
const v3Example = readJson('../../../contracts/scene/v3/examples/demo-scene.json');

const validateV1 = ajv.compile(v1Schema);
const validateV2 = ajv.compile(v2Schema);
const validateV3 = ajv.compile(v3Schema);

function clone(): SceneDoc {
  return JSON.parse(JSON.stringify(v3Example)) as SceneDoc;
}

describe('scene JSON schema v1 and v2 (kept on disk, still valid)', () => {
  it('accepts the v1 and v2 examples', () => {
    expect(validateV1(v1Example)).toBe(true);
    expect(validateV2(v2Example)).toBe(true);
  });
});

describe('scene JSON schema v3', () => {
  it('accepts the v3 example', () => {
    const valid = validateV3(v3Example);
    if (!valid) {
      throw new Error(JSON.stringify(validateV3.errors, null, 2));
    }
    expect(valid).toBe(true);
  });

  it('is also accepted by validateScene', () => {
    expect(validateScene(clone(), elementTypeRegistry)).toEqual({ ok: true, issues: [] });
  });

  it('accepts a LINEAR element and rejects one carrying size/placement', () => {
    const doc = clone();
    doc.elements.push({
      id: 'mojo_1',
      typeCode: 'MOJO_BARRICADE',
      label: 'Mojo barricade 1',
      path: {
        value: [
          { x: 0, y: 0 },
          { x: 6320000, y: 0 },
        ],
        provenance: 'ARCHETYPE',
      },
      widthTmm: 1250,
      params: {},
    } as never);
    expect(validateV3(doc)).toBe(true);

    const mixed = clone();
    mixed.elements.push({
      id: 'mojo_2',
      typeCode: 'MOJO_BARRICADE',
      label: 'Bad linear',
      path: { value: [{ x: 0, y: 0 }, { x: 1000, y: 0 }], provenance: 'STATED' },
      widthTmm: 1250,
      size: { value: { x: 1, y: 1, z: 1 }, provenance: 'STATED' },
      params: {},
    } as never);
    expect(validateV3(mixed)).toBe(false);
  });

  it('rejects a float length', () => {
    const doc = clone();
    if (doc.elements[0] !== undefined) {
      (doc.elements[0].size!.value as { x: number }).x = 1.5;
    }
    expect(validateV3(doc)).toBe(false);
  });

  it('rejects a missing provenance', () => {
    const doc = clone();
    if (doc.elements[0] !== undefined) {
      Reflect.deleteProperty(doc.elements[0].size!, 'provenance');
    }
    expect(validateV3(doc)).toBe(false);
  });

  it('rejects an unknown zone kind', () => {
    const doc = clone();
    if (doc.zones[0] !== undefined) {
      (doc.zones[0] as { kind: string }).kind = 'STAGE';
    }
    expect(validateV3(doc)).toBe(false);
  });

  it('accepts the new zone kinds', () => {
    for (const kind of ['HOSPITALITY', 'PIT', 'TABLES', 'SPONSOR'] as const) {
      const doc = clone();
      if (doc.zones[0] !== undefined) {
        (doc.zones[0] as { kind: string }).kind = kind;
      }
      expect(validateV3(doc), kind).toBe(true);
    }
  });

  it('requires site.kind, site.level, zone density and measurements', () => {
    const noKind = clone();
    Reflect.deleteProperty(noKind.site, 'kind');
    expect(validateV3(noKind)).toBe(false);

    const noLevel = clone();
    Reflect.deleteProperty(noLevel.site, 'level');
    expect(validateV3(noLevel)).toBe(false);

    const noDensity = clone();
    if (noDensity.zones[0] !== undefined) {
      Reflect.deleteProperty(noDensity.zones[0], 'densitySqFtPerPerson');
    }
    expect(validateV3(noDensity)).toBe(false);

    const noMeasurements = clone();
    Reflect.deleteProperty(noMeasurements, 'measurements');
    expect(validateV3(noMeasurements)).toBe(false);
  });
});
