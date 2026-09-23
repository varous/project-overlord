/**
 * Per-file Postgres test harness. Each integration test file creates its own throwaway database
 * (named with a random suffix), applies the migrations and drops the database afterwards, so runs
 * are isolated and leave no state behind.
 */

import { randomBytes } from 'node:crypto';

import pg from 'pg';

import { runMigrations, type PgPool } from '../src/db.js';

export const databaseUrl = process.env.TEST_DATABASE_URL;
export const databaseAvailable = databaseUrl !== undefined && databaseUrl !== '';

if (!databaseAvailable) {
  console.log(
    '[apps/api] TEST_DATABASE_URL is not set — skipping Postgres integration tests. Start Postgres via `docker compose -f infra/docker-compose.yml up -d` and export TEST_DATABASE_URL to run them.',
  );
}

export interface TestDb {
  pool: PgPool;
  name: string;
  cleanup: () => Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  if (!databaseAvailable) {
    throw new Error('TEST_DATABASE_URL is not set');
  }

  const base = new URL(databaseUrl as string);
  const adminUrl = new URL(base.toString());
  adminUrl.pathname = '/postgres';

  const name = `overlord_test_${randomBytes(4).toString('hex')}`;

  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();

  const dbUrl = new URL(base.toString());
  dbUrl.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: dbUrl.toString(), max: 5 });

  await runMigrations(pool, new URL('../migrations/', import.meta.url));

  return {
    pool,
    name,
    async cleanup() {
      await pool.end();
      const cleanupClient = new pg.Client({ connectionString: adminUrl.toString() });
      await cleanupClient.connect();
      await cleanupClient.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await cleanupClient.end();
    },
  };
}
