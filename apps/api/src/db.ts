/**
 * Database access: a single pg Pool plus the plain-SQL migration runner.
 */

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const { Pool } = pg;

export type PgPool = pg.Pool;
export type PgPoolClient = pg.PoolClient;

export function createPool(databaseUrl: string): PgPool {
  return new Pool({ connectionString: databaseUrl, max: 10 });
}

/**
 * Applies SQL files in `migrationsDir` in filename order, each inside its own transaction, and
 * records every applied filename in `schema_migrations`. Already-recorded files are skipped.
 * Migrations that have been applied are never edited; add a new file instead.
 */
export async function runMigrations(pool: PgPool, migrationsDir: URL): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (filename text primary key, applied_at timestamptz not null default now())',
    );
    const appliedResult = await client.query<{ filename: string }>(
      'SELECT filename FROM schema_migrations',
    );
    const applied = new Set(appliedResult.rows.map((row) => row.filename));

    const dir = fileURLToPath(migrationsDir);
    const files = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();
    const appliedNow: string[] = [];

    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }
      const sql = await readFile(`${dir}/${file}`, 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Migration ${file} failed: ${message}`);
      }
      appliedNow.push(file);
    }

    return appliedNow;
  } finally {
    client.release();
  }
}

/** True when the pool can reach the database. Used by GET /health (never throws). */
export async function databaseUp(pool: PgPool): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
