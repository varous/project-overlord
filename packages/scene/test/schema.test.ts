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

const validateV1 = ajv.compile(v1Schema);
const validateV2 = ajv.compile(v2Schema);

function clone(): SceneDoc {
  return JSON.parse(JSON.stringify(v2Example)) as SceneDoc;
}

describe('scene JSON schema v1 (kept on disk, still valid)', () => {
  it('accepts the v1 example', () => {
    expect(validateV1(v1Example)).toBe(true);
  });
});

describe('scene JSON schema v2', () => {
  it('accepts the v2 example', () => {
    const valid = validateV2(v2Example);
    if (!valid) {
      throw new Error(JSON.stringify(validateV2.errors, null, 2));
    }
    expect(valid).toBe(true);
  });

  it('is also accepted by validateScene', () => {
    expect(validateScene(clone(), elementTypeRegistry)).toEqual({ ok: true, issues: [] });
  });

  it('rejects a float length', () => {
    const doc = clone();
    if (doc.elements[0] !== undefined) {
      (doc.elements[0].size.value as { x: number }).x = 1.5;
    }
    expect(validateV2(doc)).toBe(false);
  });

  it('rejects a missing provenance', () => {
    const doc = clone();
    if (doc.elements[0] !== undefined) {
      Reflect.deleteProperty(doc.elements[0].size, 'provenance');
    }
    expect(validateV2(doc)).toBe(false);
  });

  it('rejects an unknown zone kind', () => {
    const doc = clone();
    if (doc.zones[0] !== undefined) {
      (doc.zones[0] as { kind: string }).kind = 'STAGE';
    }
    expect(validateV2(doc)).toBe(false);
  });

  it('requires site.kind, site.level, zone density and measurements', () => {
    const noKind = clone();
    Reflect.deleteProperty(noKind.site, 'kind');
    expect(validateV2(noKind)).toBe(false);

    const noLevel = clone();
    Reflect.deleteProperty(noLevel.site, 'level');
    expect(validateV2(noLevel)).toBe(false);

    const noDensity = clone();
    if (noDensity.zones[0] !== undefined) {
      Reflect.deleteProperty(noDensity.zones[0], 'densitySqFtPerPerson');
    }
    expect(validateV2(noDensity)).toBe(false);

    const noMeasurements = clone();
    Reflect.deleteProperty(noMeasurements, 'measurements');
    expect(validateV2(noMeasurements)).toBe(false);
  });
});
