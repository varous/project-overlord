import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runMigrations } from '../src/db.js';
import { createTestDb, databaseAvailable, type TestDb } from './harness.js';

describe.runIf(databaseAvailable)('migrations', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(async () => {
    await db.cleanup();
  });

  it('applies 0001_init.sql, records it, and is idempotent', async () => {
    const applied = await db.pool.query('SELECT filename FROM schema_migrations ORDER BY filename');
    expect(applied.rows.map((row) => row.filename)).toEqual(['0001_init.sql']);

    const again = await runMigrations(db.pool, new URL('../migrations/', import.meta.url));
    expect(again).toEqual([]);
  });

  it('creates the expected tables', async () => {
    const result = await db.pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    );
    const tables = result.rows.map((row) => row.table_name as string);
    expect(tables).toEqual(
      expect.arrayContaining(['scene', 'scene_version', 'share_link', 'schema_migrations']),
    );
  });
});
