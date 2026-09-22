import { describe, expect, it } from 'vitest';

import {
  commitVersion,
  contentHash,
  createInitialVersion,
  diffScenes,
  elementTypeRegistry,
  SceneError,
  type Ring2,
  type VersionOptions,
} from '../src/index.js';
import { makeScene } from './fixtures.js';

const options: VersionOptions = {
  author: 'tester',
  message: 'test',
  now: '2026-01-01T00:00:00.000Z',
  registry: elementTypeRegistry,
};

describe('createInitialVersion', () => {
  it('creates version 1 with a matching content hash', async () => {
    const doc = makeScene();
    const version = await createInitialVersion(doc, options);
    expect(version.sceneId).toBe(doc.id);
    expect(version.version).toBe(1);
    expect(version.parentVersion).toBeNull();
    expect(version.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(version.contentHash).toBe(await contentHash(doc));
  });

  it('refuses an invalid doc and attaches the issues', async () => {
    const doc = makeScene();
    (doc as unknown as { schemaVersion: number }).schemaVersion = 9;
    await expect(createInitialVersion(doc, options)).rejects.toMatchObject({
      code: 'INVALID_SCENE',
    });
    try {
      await createInitialVersion(doc, options);
    } catch (error) {
      expect(error).toBeInstanceOf(SceneError);
      expect((error as SceneError).issues.length).toBeGreaterThan(0);
    }
  });

  it('deep-freezes the version and the document', async () => {
    const version = await createInitialVersion(makeScene(), options);
    expect(Object.isFrozen(version)).toBe(true);
    expect(Object.isFrozen(version.doc)).toBe(true);
    expect(Object.isFrozen(version.doc.elements)).toBe(true);
    expect(() => {
      (version as { version: number }).version = 99;
    }).toThrow();
    expect(() => {
      (version.doc as { name: string }).name = 'changed';
    }).toThrow();
    expect(() => {
      (version.doc.elements[0] as { label: string }).label = 'changed';
    }).toThrow();
  });
});

describe('commitVersion', () => {
  it('increments the version and links the parent', async () => {
    const first = await createInitialVersion(makeScene(), options);
    const next = makeScene();
    next.name = 'Edited';
    const second = await commitVersion(first, next, options);
    expect(second.version).toBe(2);
    expect(second.parentVersion).toBe(1);
    expect(second.contentHash).not.toBe(first.contentHash);
  });

  it('refuses a changed scene id', async () => {
    const first = await createInitialVersion(makeScene(), options);
    const next = makeScene();
    next.id = 'scn_aaaaaaaaaaaaaaaaaaaa';
    await expect(commitVersion(first, next, options)).rejects.toMatchObject({
      code: 'SCENE_ID_MISMATCH',
    });
  });

  it('refuses an unchanged document', async () => {
    const first = await createInitialVersion(makeScene(), options);
    await expect(commitVersion(first, makeScene(), options)).rejects.toMatchObject({
      code: 'NO_CHANGE',
    });
  });

  it('refuses an invalid document', async () => {
    const first = await createInitialVersion(makeScene(), options);
    const next = makeScene();
    next.name = 'Edited';
    (next as unknown as { schemaVersion: number }).schemaVersion = 2;
    await expect(commitVersion(first, next, options)).rejects.toMatchObject({
      code: 'INVALID_SCENE',
    });
  });
});

describe('diffScenes', () => {
  it('detects a move', () => {
    const before = makeScene();
    const after = makeScene();
    if (after.elements[0] !== undefined) {
      (after.elements[0].placement.value.center as { x: number }).x = 1000;
    }
    const diff = diffScenes(before, after);
    expect(diff.elements.changed).toEqual([{ id: 'main_stage', fields: ['placement'] }]);
  });

  it('detects a resize and a relabel', () => {
    const before = makeScene();
    const after = makeScene();
    if (after.elements[0] !== undefined) {
      (after.elements[0].size.value as { x: number }).x = 100000;
      after.elements[0].label = 'Renamed';
    }
    const diff = diffScenes(before, after);
    expect(diff.elements.changed).toEqual([{ id: 'main_stage', fields: ['label', 'size'] }]);
  });

  it('detects added and removed elements', () => {
    const before = makeScene();
    const after = makeScene();
    const removed = after.elements.pop();
    if (removed !== undefined) {
      after.elements.push({ ...removed, id: 'extra_element', label: 'Extra' });
    }
    const diff = diffScenes(before, after);
    expect(diff.elements.added).toEqual(['extra_element']);
    expect(diff.elements.removed).toEqual(['green_room_4']);
  });

  it('detects an anchor change', () => {
    const before = makeScene();
    const after = makeScene();
    (after.site.anchor.value as { latDeg: number }).latDeg = 22.56;
    const diff = diffScenes(before, after);
    expect(diff.siteChanged).toEqual(['anchor']);
    expect(diff.elements.changed).toEqual([]);
  });

  it('detects a zone ring change', () => {
    const before = makeScene();
    const after = makeScene();
    if (after.zones[0] !== undefined) {
      after.zones[0].ring.value = after.zones[0].ring.value.map((point) => ({
        x: point.x,
        y: point.y + 100,
      })) as unknown as Ring2;
    }
    const diff = diffScenes(before, after);
    expect(diff.zones.changed).toEqual([{ id: 'audience_zone', fields: ['ring'] }]);
  });
});
