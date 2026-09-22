import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import { elementTypeRegistry, validateScene, type SceneDoc } from '../src/index.js';
import { demoScenePath, makeScene } from './fixtures.js';

const schemaPath = fileURLToPath(
  new URL('../../../contracts/scene/v1/scene.schema.json', import.meta.url),
);
const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object;
const demoDoc = JSON.parse(readFileSync(demoScenePath(), 'utf8')) as SceneDoc;

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

describe('scene.schema.json', () => {
  it('accepts the demo example', () => {
    const valid = validate(demoDoc);
    if (!valid) {
      throw new Error(JSON.stringify(validate.errors, null, 2));
    }
    expect(valid).toBe(true);
  });

  it('is also accepted by validateScene', () => {
    expect(validateScene(makeScene(), elementTypeRegistry)).toEqual({ ok: true, issues: [] });
  });

  it('rejects a float length', () => {
    const doc = makeScene();
    if (doc.elements[0] !== undefined) {
      (doc.elements[0].size.value as { x: number }).x = 1.5;
    }
    expect(validate(doc)).toBe(false);
  });

  it('rejects a missing provenance', () => {
    const doc = makeScene();
    if (doc.elements[0] !== undefined) {
      Reflect.deleteProperty(doc.elements[0].size, 'provenance');
    }
    expect(validate(doc)).toBe(false);
  });

  it('rejects an unknown zone kind', () => {
    const doc = makeScene();
    if (doc.zones[0] !== undefined) {
      (doc.zones[0] as { kind: string }).kind = 'STAGE';
    }
    expect(validate(doc)).toBe(false);
  });
});
