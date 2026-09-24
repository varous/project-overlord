import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DENSITY_SQFT_PER_PERSON,
  canonicalJson,
  elementTypeRegistry,
  migrateSceneDoc,
  validateScene,
  type SceneDoc,
} from '../src/index.js';

const v1Path = fileURLToPath(
  new URL('../../../contracts/scene/v1/examples/demo-scene.json', import.meta.url),
);

function v1Doc(): SceneDoc {
  return JSON.parse(readFileSync(v1Path, 'utf8')) as SceneDoc;
}

describe('migrateSceneDoc', () => {
  it('upgrades a v1 document to the current schema with the new fields', () => {
    const migrated = migrateSceneDoc(v1Doc());
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.site.kind).toBe('OPEN_GROUND');
    expect(migrated.site.level).toBe(0);
    expect(migrated.measurements).toEqual([]);
    for (const zone of migrated.zones) {
      expect(zone.densitySqFtPerPerson.value).toBe(DEFAULT_DENSITY_SQFT_PER_PERSON);
      expect(zone.densitySqFtPerPerson.provenance).toBe('ARCHETYPE');
      expect(zone.densitySqFtPerPerson.note).toBe(
        'CAV standard, stated on the Aquatica V5 drawing',
      );
    }
  });

  it('produces a valid scene', () => {
    const migrated = migrateSceneDoc(v1Doc());
    expect(validateScene(migrated, elementTypeRegistry)).toEqual({ ok: true, issues: [] });
  });

  it('is a no-op when run again', () => {
    const once = migrateSceneDoc(v1Doc());
    const twice = migrateSceneDoc(once);
    expect(twice.schemaVersion).toBe(3);
    expect(canonicalJson(twice)).toBe(canonicalJson(once));
  });

  it('upgrades a v2 document to v3 without touching anything else', () => {
    const v2 = JSON.parse(
      readFileSync(
        fileURLToPath(new URL('../../../contracts/scene/v2/examples/demo-scene.json', import.meta.url)),
        'utf8',
      ),
    ) as SceneDoc;
    const migrated = migrateSceneDoc(v2);
    expect(migrated.schemaVersion).toBe(3);
    // Everything apart from the version is identical.
    expect(canonicalJson({ ...migrated, schemaVersion: 2 })).toBe(canonicalJson(v2));
    expect(canonicalJson(migrateSceneDoc(migrated))).toBe(canonicalJson(migrated));
  });

  it('refuses an unsupported version', () => {
    const doc = v1Doc() as unknown as { schemaVersion: number };
    doc.schemaVersion = 99;
    expect(() => migrateSceneDoc(doc as never)).toThrow(/unsupported schemaVersion/);
  });
});
