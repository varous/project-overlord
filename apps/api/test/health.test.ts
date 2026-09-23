import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import pg from 'pg';

import { buildServer } from '../src/server.js';
import { createTestDb, databaseAvailable, type TestDb } from './harness.js';
import { testConfig } from './support.js';

describe.runIf(databaseAvailable)('GET /health with a live database', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(async () => {
    await db.cleanup();
  });

  it('reports db up', async () => {
    const app = await buildServer({ config: testConfig(), pool: db.pool, logger: false });
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.db).toBe('up');
    expect(body.commit).toBe('deadbeef12345678');
    expect(body.startedAt).toEqual(expect.any(String));
  });
});

describe('GET /health without a reachable database', () => {
  it('still returns 200 with db down', async () => {
    const deadPool = new pg.Pool({
      connectionString: 'postgresql://postgres:postgres@127.0.0.1:1/none',
      connectionTimeoutMillis: 500,
      max: 1,
    });
    try {
      const app = await buildServer({ config: testConfig(), pool: deadPool, logger: false });
      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(200);
      expect(response.json().db).toBe('down');
    } finally {
      await deadPool.end();
    }
  });
});
