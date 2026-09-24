import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildServer } from '../src/server.js';
import { createTestDb, databaseAvailable, type TestDb } from './harness.js';
import { authHeaders, demoDoc, testConfig } from './support.js';

describe.runIf(databaseAvailable)('POST /scenes and scene reads', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(async () => {
    await db.cleanup();
  });

  it('rejects a missing bearer token', async () => {
    const app = await buildServer({ config: testConfig(), pool: db.pool, logger: false });
    const response = await app.inject({ method: 'POST', url: '/scenes', payload: { doc: demoDoc() } });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'UNAUTHORIZED', message: 'Missing or invalid bearer token' });
  });

  it('rejects a wrong bearer token', async () => {
    const app = await buildServer({ config: testConfig(), pool: db.pool, logger: false });
    const response = await app.inject({
      method: 'POST',
      url: '/scenes',
      headers: { authorization: 'Bearer wrong' },
      payload: { doc: demoDoc() },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'UNAUTHORIZED', message: 'Missing or invalid bearer token' });
  });

  it('rejects an invalid doc with 422 and the issue codes', async () => {
    const app = await buildServer({ config: testConfig(), pool: db.pool, logger: false });
    const bad = { ...demoDoc(), schemaVersion: 3 } as unknown as Record<string, unknown>;
    const response = await app.inject({
      method: 'POST',
      url: '/scenes',
      headers: authHeaders,
      payload: { doc: bad },
    });
    expect(response.statusCode).toBe(422);
    const body = response.json();
    expect(body.error).toBe('SCENE_INVALID');
    const codes = (body.details as Array<{ code: string }>).map((issue) => issue.code);
    expect(codes).toContain('SCHEMA_VERSION');
  });

  it('creates a scene, assigns a server id, and reads it back', async () => {
    const app = await buildServer({ config: testConfig(), pool: db.pool, logger: false });

    const created = await app.inject({
      method: 'POST',
      url: '/scenes',
      headers: authHeaders,
      payload: { doc: demoDoc(), name: 'Demo scene', message: 'initial' },
    });
    expect(created.statusCode).toBe(201);
    const createdBody = created.json();
    expect(createdBody.sceneId).toMatch(/^scn_[a-z2-7]{20}$/);
    expect(createdBody.version).toBe(1);
    expect(createdBody.contentHash).toMatch(/^[0-9a-f]{64}$/);

    const read = await app.inject({ method: 'GET', url: `/scenes/${createdBody.sceneId}`, headers: authHeaders });
    expect(read.statusCode).toBe(200);
    const readBody = read.json();
    expect(readBody.id).toBe(createdBody.sceneId);
    expect(readBody.name).toBe('Demo scene');
    expect(readBody.latestVersion).toBe(1);
    expect(readBody.archived).toBe(false);
    expect(readBody.createdAt).toEqual(expect.any(String));
    expect(readBody.updatedAt).toEqual(expect.any(String));

    const missing = await app.inject({ method: 'GET', url: '/scenes/scn_00000000000000000000', headers: authHeaders });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error).toBe('SCENE_NOT_FOUND');
  });

  it('lists scenes ordered by updated_at desc', async () => {
    const app = await buildServer({ config: testConfig(), pool: db.pool, logger: false });

    const first = await app.inject({
      method: 'POST',
      url: '/scenes',
      headers: authHeaders,
      payload: { doc: demoDoc(), name: 'First' },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/scenes',
      headers: authHeaders,
      payload: { doc: demoDoc(), name: 'Second' },
    });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);

    const list = await app.inject({ method: 'GET', url: '/scenes', headers: authHeaders });
    expect(list.statusCode).toBe(200);
    const body = list.json();
    const names = (body.scenes as Array<{ name: string }>).map((scene) => scene.name);
    expect(names).toContain('First');
    expect(names).toContain('Second');
    expect(body.scenes[0]).toHaveProperty('id');
    expect(body.scenes[0]).toHaveProperty('latestVersion');
    expect(body.scenes[0]).toHaveProperty('updatedAt');
  });
});
