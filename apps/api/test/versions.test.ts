import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildServer } from '../src/server.js';
import { createTestDb, databaseAvailable, type TestDb } from './harness.js';
import { authHeaders, demoDoc, testConfig } from './support.js';

describe.runIf(databaseAvailable)('scene versions', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(async () => {
    await db.cleanup();
  });

  async function createScene(app: Awaited<ReturnType<typeof buildServer>>) {
    const response = await app.inject({
      method: 'POST',
      url: '/scenes',
      headers: authHeaders,
      payload: { doc: demoDoc(), name: 'Versioned scene' },
    });
    return response.json() as { sceneId: string; version: number; contentHash: string };
  }

  async function postVersion(app: Awaited<ReturnType<typeof buildServer>>, sceneId: string, doc: unknown, parentVersion: number) {
    return app.inject({
      method: 'POST',
      url: `/scenes/${sceneId}/versions`,
      headers: authHeaders,
      payload: { doc, message: 'next', parentVersion },
    });
  }

  it('builds a chain of three versions and lists them newest first', async () => {
    const app = await buildServer({ config: testConfig(), pool: db.pool, logger: false });
    const scene = await createScene(app);

    const v2doc = { ...demoDoc(), name: 'Version 2' };
    const v3doc = { ...demoDoc(), name: 'Version 3' };

    const v2 = await postVersion(app, scene.sceneId, v2doc, 1);
    expect(v2.statusCode).toBe(201);
    expect(v2.json().version).toBe(2);

    const v3 = await postVersion(app, scene.sceneId, v3doc, 2);
    expect(v3.statusCode).toBe(201);
    expect(v3.json().version).toBe(3);

    const list = await app.inject({ method: 'GET', url: `/scenes/${scene.sceneId}/versions`, headers: authHeaders });
    expect(list.statusCode).toBe(200);
    const versions = list.json() as Array<{ version: number; parentVersion: number | null }>;
    expect(versions.map((row) => row.version)).toEqual([3, 2, 1]);
    expect(versions[0]?.parentVersion).toBe(2);
    expect(versions[2]?.parentVersion).toBeNull();
  });

  it('rejects a stale parentVersion with VERSION_CONFLICT', async () => {
    const app = await buildServer({ config: testConfig(), pool: db.pool, logger: false });
    const scene = await createScene(app);
    await postVersion(app, scene.sceneId, { ...demoDoc(), name: 'Version 2' }, 1);

    const conflict = await postVersion(app, scene.sceneId, { ...demoDoc(), name: 'Version 3' }, 1);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({
      error: 'VERSION_CONFLICT',
      message: 'parentVersion does not match the latest version',
      details: { latestVersion: 2 },
    });
  });

  it('rejects an unchanged doc with NO_CHANGE', async () => {
    const app = await buildServer({ config: testConfig(), pool: db.pool, logger: false });
    const scene = await createScene(app);
    const v2doc = { ...demoDoc(), name: 'Version 2' };
    await postVersion(app, scene.sceneId, v2doc, 1);

    const noChange = await postVersion(app, scene.sceneId, v2doc, 2);
    expect(noChange.statusCode).toBe(409);
    expect(noChange.json().error).toBe('NO_CHANGE');
  });

  it('resolves the "latest" version alias with the full record including doc', async () => {
    const app = await buildServer({ config: testConfig(), pool: db.pool, logger: false });
    const scene = await createScene(app);
    await postVersion(app, scene.sceneId, { ...demoDoc(), name: 'Version 2' }, 1);
    await postVersion(app, scene.sceneId, { ...demoDoc(), name: 'Version 3' }, 2);

    const latest = await app.inject({
      method: 'GET',
      url: `/scenes/${scene.sceneId}/versions/latest`,
      headers: authHeaders,
    });
    expect(latest.statusCode).toBe(200);
    const body = latest.json();
    expect(body.version).toBe(3);
    expect(body.sceneId).toBe(scene.sceneId);
    expect(body.doc.name).toBe('Version 3');
    expect(body.parentVersion).toBe(2);
  });

  it('lets exactly one of two concurrent commits with the same parentVersion win (5 runs)', async () => {
    const app = await buildServer({ config: testConfig(), pool: db.pool, logger: false });

    for (let run = 1; run <= 5; run += 1) {
      const scene = await createScene(app);
      const [first, second] = await Promise.all([
        postVersion(app, scene.sceneId, { ...demoDoc(), name: `Run ${run} A` }, 1),
        postVersion(app, scene.sceneId, { ...demoDoc(), name: `Run ${run} B` }, 1),
      ]);

      const statuses = [first.statusCode, second.statusCode].sort((a, b) => a - b);
      expect(statuses, `run ${run}: exactly one 201 and one 409`).toEqual([201, 409]);

      const loser = first.statusCode === 409 ? first : second;
      expect(loser.json().error, `run ${run}`).toBe('VERSION_CONFLICT');
      expect(loser.json().details.latestVersion, `run ${run}`).toBe(2);

      const list = await app.inject({
        method: 'GET',
        url: `/scenes/${scene.sceneId}/versions`,
        headers: authHeaders,
      });
      expect((list.json() as unknown[]).length, `run ${run}: only the winner was stored`).toBe(2);
    }
  });
});
