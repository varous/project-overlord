/**
 * Scene document migration. v1 documents are upgraded in memory to v2; v2 documents pass through
 * unchanged (a second migration is a no-op).
 */

import { sourced } from '@overlord/geo-core';

import type { SceneDoc, SceneSite, SceneZone } from './types.js';

/** The CAV planning default used when a v1 zone has no density. */
export const DEFAULT_DENSITY_SQFT_PER_PERSON = 5;
export const DENSITY_NOTE = 'CAV standard, stated on the Aquatica V5 drawing';

function defaultDensity() {
  return sourced(DEFAULT_DENSITY_SQFT_PER_PERSON, 'ARCHETYPE', DENSITY_NOTE);
}

/**
 * Upgrade any supported scene version to the current schemaVersion. Throws on an unsupported
 * version rather than returning half-migrated geometry.
 */
export function migrateSceneDoc(input: SceneDoc | Record<string, unknown>): SceneDoc {
  const doc = structuredClone(input) as Record<string, unknown> & {
    schemaVersion?: unknown;
    site?: Record<string, unknown>;
    zones?: unknown[];
    measurements?: unknown[];
  };

  if (doc.schemaVersion === 2) {
    return doc as unknown as SceneDoc;
  }
  if (doc.schemaVersion !== 1) {
    throw new Error(`Cannot migrate unsupported schemaVersion ${String(doc.schemaVersion)}`);
  }

  const site = (doc.site ?? {}) as Record<string, unknown>;
  const migratedSite: SceneSite = {
    ...(site as unknown as SceneSite),
    kind: (site.kind as SceneSite['kind'] | undefined) ?? 'OPEN_GROUND',
    level: typeof site.level === 'number' ? site.level : 0,
  };

  const zones = (Array.isArray(doc.zones) ? doc.zones : []).map((zone) => {
    const record = zone as Record<string, unknown>;
    const density = record.densitySqFtPerPerson;
    const migrated: SceneZone = {
      ...(record as unknown as SceneZone),
      densitySqFtPerPerson:
        density === undefined || density === null
          ? defaultDensity()
          : (density as SceneZone['densitySqFtPerPerson']),
    };
    return migrated;
  });

  const migrated = {
    ...doc,
    schemaVersion: 2,
    site: migratedSite,
    zones,
    measurements: Array.isArray(doc.measurements) ? doc.measurements : [],
  } as unknown as SceneDoc;

  return migrated;
}
