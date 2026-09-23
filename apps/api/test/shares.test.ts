import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildServer } from '../src/server.js';
import { createTestDb, databaseAvailable, type TestDb } from './harness.js';
import { authHeaders, demoDoc, testConfig } from './support.js';

describe.runIf(databaseAvailable)('share links', () => {
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
      payload: { doc: demoDoc(), name: 'Shareable scene' },
    });
    return response.json() as { sceneId: string };
  }

  it('creates a share, reads it without auth, revokes it, then 404s', async () => {
    const app = await buildServer({ config: testConfig(), pool: db.pool, logger: false });
    const scene = await createScene(app);

    const created = await app.inject({
      method: 'POST',
      url: `/scenes/${scene.sceneId}/shares`,
      headers: authHeaders,
      payload: {},
    });
    expect(created.statusCode).toBe(201);
    const createdBody = created.json();
    expect(createdBody.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(createdBody.url).toBe(`https://example.test/?share=${createdBody.token}`);

    const read = await app.inject({ method: 'GET', url: `/shares/${createdBody.token}` });
    expect(read.statusCode).toBe(200);
    const readBody = read.json();
    expect(Object.keys(readBody).sort()).toEqual(['doc', 'name', 'sceneId', 'version']);
    expect(readBody.sceneId).toBe(scene.sceneId);
    expect(readBody.version).toBe(1);
    expect(readBody.name).toBe('Shareable scene');
    expect(readBody.doc.id).toBe(scene.sceneId);

    const revoked = await app.inject({
      method: 'DELETE',
      url: `/shares/${createdBody.token}`,
      headers: authHeaders,
    });
    expect(revoked.statusCode).toBe(204);

    const afterRevoke = await app.inject({ method: 'GET', url: `/shares/${createdBody.token}` });
    expect(afterRevoke.statusCode).toBe(404);
    expect(afterRevoke.json().error).toBe('SHARE_NOT_FOUND');
  });

  it('returns 404 for a missing share token', async () => {
    const app = await buildServer({ config: testConfig(), pool: db.pool, logger: false });
    const missing = await app.inject({ method: 'GET', url: '/shares/does-not-exist' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error).toBe('SHARE_NOT_FOUND');
  });

  it('returns 404 for an expired share', async () => {
    const app = await buildServer({ config: testConfig(), pool: db.pool, logger: false });
    const scene = await createScene(app);

    const created = await app.inject({
      method: 'POST',
      url: `/scenes/${scene.sceneId}/shares`,
      headers: authHeaders,
      payload: { expiresInDays: 1 },
    });
    const token = (created.json() as { token: string }).token;
    await db.pool.query(`UPDATE share_link SET expires_at = now() - interval '1 day' WHERE token = $1`, [token]);

    const expired = await app.inject({ method: 'GET', url: `/shares/${token}` });
    expect(expired.statusCode).toBe(404);
    expect(expired.json().error).toBe('SHARE_NOT_FOUND');
  });

  it('rejects a share for a version beyond the latest with 404', async () => {
    const app = await buildServer({ config: testConfig(), pool: db.pool, logger: false });
    const scene = await createScene(app);

    const created = await app.inject({
      method: 'POST',
      url: `/scenes/${scene.sceneId}/shares`,
      headers: authHeaders,
      payload: { version: 5 },
    });
    expect(created.statusCode).toBe(404);
    expect(created.json().error).toBe('VERSION_NOT_FOUND');
  });

  it('treats expiresInDays 0 as never expiring', async () => {
    const app = await buildServer({ config: testConfig(), pool: db.pool, logger: false });
    const scene = await createScene(app);

    const created = await app.inject({
      method: 'POST',
      url: `/scenes/${scene.sceneId}/shares`,
      headers: authHeaders,
      payload: { expiresInDays: 0 },
    });
    const token = (created.json() as { token: string }).token;

    const read = await app.inject({ method: 'GET', url: `/shares/${token}` });
    expect(read.statusCode).toBe(200);
  });
});
