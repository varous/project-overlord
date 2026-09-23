/**
 * SQL access for scenes, versions and share links. No ORM — plain parameterised queries.
 */

import type { SceneDoc } from '@overlord/scene';

import type { PgPool, PgPoolClient } from './db.js';

export interface SceneRow {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  archived: boolean;
  latestVersion: number;
}

export interface VersionMetaRow {
  version: number;
  parentVersion: number | null;
  createdAt: Date;
  author: string;
  message: string;
  contentHash: string;
}

export interface VersionRow extends VersionMetaRow {
  doc: SceneDoc;
}

export interface ShareRow {
  sceneId: string;
  version: number;
  name: string;
  doc: SceneDoc;
}

interface SceneDbRow {
  id: string;
  name: string;
  created_at: Date;
  updated_at: Date;
  archived: boolean;
  latest_version: number | string;
}

interface VersionMetaDbRow {
  version: number;
  parent_version: number | null;
  created_at: Date;
  author: string;
  message: string;
  content_hash: string;
}

interface VersionDbRow extends VersionMetaDbRow {
  doc: unknown;
}

interface ShareDbRow {
  scene_id: string;
  version: number;
  name: string;
  doc: unknown;
}

function mapScene(row: SceneDbRow): SceneRow {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archived: row.archived,
    latestVersion: Number(row.latest_version),
  };
}

function mapVersionMeta(row: VersionMetaDbRow): VersionMetaRow {
  return {
    version: row.version,
    parentVersion: row.parent_version,
    createdAt: row.created_at,
    author: row.author,
    message: row.message,
    contentHash: row.content_hash,
  };
}

function mapVersion(row: VersionDbRow): VersionRow {
  return {
    ...mapVersionMeta(row),
    doc: row.doc as unknown as SceneDoc,
  };
}

async function withTransaction<T>(
  pool: PgPool,
  fn: (client: PgPoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createScene(
  pool: PgPool,
  args: { id: string; name: string; author: string; message: string; hash: string; doc: SceneDoc },
): Promise<void> {
  await withTransaction(pool, async (client) => {
    await client.query('INSERT INTO scene (id, name) VALUES ($1, $2)', [args.id, args.name]);
    await client.query(
      'INSERT INTO scene_version (scene_id, version, parent_version, author, message, content_hash, doc) VALUES ($1, 1, NULL, $2, $3, $4, $5)',
      [args.id, args.author, args.message, args.hash, args.doc],
    );
  });
}

export async function getScene(pool: PgPool, id: string): Promise<SceneRow | null> {
  const result = await pool.query<SceneDbRow>(
    `SELECT id, name, created_at, updated_at, archived,
            (SELECT COALESCE(MAX(version), 0) FROM scene_version WHERE scene_id = scene.id) AS latest_version
       FROM scene WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  return row === undefined ? null : mapScene(row);
}

export async function listScenes(
  pool: PgPool,
  limit: number,
  cursor: Date | null,
  includeArchived: boolean,
): Promise<{ scenes: SceneRow[]; nextCursor: Date | null }> {
  const params: unknown[] = [];
  const clauses: string[] = [];
  if (!includeArchived) {
    clauses.push('archived = false');
  }
  if (cursor !== null) {
    params.push(cursor);
    clauses.push(`updated_at < $${params.length}`);
  }
  const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
  params.push(limit + 1);

  const result = await pool.query<SceneDbRow>(
    `SELECT id, name, created_at, updated_at, archived,
            (SELECT COALESCE(MAX(version), 0) FROM scene_version WHERE scene_id = scene.id) AS latest_version
       FROM scene${where}
      ORDER BY updated_at DESC, id DESC
      LIMIT $${params.length}`,
    params,
  );

  const rows = result.rows;
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    scenes: page.map(mapScene),
    nextCursor: hasMore && last !== undefined ? last.updated_at : null,
  };
}

export async function getLatestVersion(pool: PgPool, sceneId: string): Promise<number | null> {
  const result = await pool.query<{ v: number | null }>(
    'SELECT MAX(version) AS v FROM scene_version WHERE scene_id = $1',
    [sceneId],
  );
  const value = result.rows[0]?.v;
  return value === null || value === undefined ? null : Number(value);
}

export async function listVersions(pool: PgPool, sceneId: string): Promise<VersionMetaRow[]> {
  const result = await pool.query<VersionMetaDbRow>(
    'SELECT version, parent_version, created_at, author, message, content_hash FROM scene_version WHERE scene_id = $1 ORDER BY version DESC',
    [sceneId],
  );
  return result.rows.map(mapVersionMeta);
}

export async function getVersion(
  pool: PgPool,
  sceneId: string,
  version: number,
): Promise<VersionRow | null> {
  const result = await pool.query<VersionDbRow>(
    'SELECT version, parent_version, created_at, author, message, content_hash, doc FROM scene_version WHERE scene_id = $1 AND version = $2',
    [sceneId, version],
  );
  const row = result.rows[0];
  return row === undefined ? null : mapVersion(row);
}

export type CommitVersionResult =
  | { ok: true; version: number }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'CONFLICT'; latestVersion: number }
  | { ok: false; reason: 'NO_CHANGE' };

/** Postgres unique-violation code. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
}

/**
 * Commit a new version with row-level locking. The scene row is locked FOR UPDATE first, then the
 * latest version is read and parentVersion re-checked INSIDE the same transaction, so two
 * simultaneous commits with the same parentVersion cannot both succeed — the second blocks on the
 * lock, then sees the new latest and returns CONFLICT. A 23505 on the insert is also converted to
 * CONFLICT as a belt-and-braces guard.
 */
export async function commitVersionGuarded(
  pool: PgPool,
  args: {
    sceneId: string;
    parentVersion: number;
    author: string;
    message: string;
    hash: string;
    doc: SceneDoc;
    sceneName: string;
  },
): Promise<CommitVersionResult> {
  return withTransaction(pool, async (client) => {
    const lock = await client.query('SELECT id FROM scene WHERE id = $1 FOR UPDATE', [args.sceneId]);
    if (lock.rowCount === 0) {
      return { ok: false, reason: 'NOT_FOUND' } as const;
    }

    const latestResult = await client.query<{ v: number | null }>(
      'SELECT MAX(version) AS v FROM scene_version WHERE scene_id = $1',
      [args.sceneId],
    );
    const latestValue = latestResult.rows[0]?.v;
    const latest = latestValue === null || latestValue === undefined ? null : Number(latestValue);
    if (latest === null) {
      return { ok: false, reason: 'CONFLICT', latestVersion: 0 } as const;
    }
    if (args.parentVersion !== latest) {
      return { ok: false, reason: 'CONFLICT', latestVersion: latest } as const;
    }

    const parent = await client.query<{ content_hash: string }>(
      'SELECT content_hash FROM scene_version WHERE scene_id = $1 AND version = $2',
      [args.sceneId, latest],
    );
    if (parent.rows[0]?.content_hash === args.hash) {
      return { ok: false, reason: 'NO_CHANGE' } as const;
    }

    try {
      await client.query(
        'INSERT INTO scene_version (scene_id, version, parent_version, author, message, content_hash, doc) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [args.sceneId, latest + 1, latest, args.author, args.message, args.hash, args.doc],
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        return { ok: false, reason: 'CONFLICT', latestVersion: latest } as const;
      }
      throw error;
    }

    await client.query('UPDATE scene SET name = $1, updated_at = now() WHERE id = $2', [
      args.sceneName,
      args.sceneId,
    ]);
    return { ok: true, version: latest + 1 } as const;
  });
}

export type CreateShareResult =
  | { ok: true; version: number }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'VERSION_NOT_FOUND' };

/**
 * Create a share link with the latest version resolved INSIDE the transaction (scene row locked),
 * so a share created while a commit lands always points at an existing version.
 */
export async function createShareGuarded(
  pool: PgPool,
  args: { token: string; sceneId: string; requestedVersion: number | null; expiresAt: Date | null },
): Promise<CreateShareResult> {
  return withTransaction(pool, async (client) => {
    const lock = await client.query('SELECT id FROM scene WHERE id = $1 FOR UPDATE', [args.sceneId]);
    if (lock.rowCount === 0) {
      return { ok: false, reason: 'NOT_FOUND' } as const;
    }

    const latestResult = await client.query<{ v: number | null }>(
      'SELECT MAX(version) AS v FROM scene_version WHERE scene_id = $1',
      [args.sceneId],
    );
    const latestValue = latestResult.rows[0]?.v;
    const latest = latestValue === null || latestValue === undefined ? null : Number(latestValue);
    if (latest === null) {
      return { ok: false, reason: 'VERSION_NOT_FOUND' } as const;
    }

    let version = latest;
    if (args.requestedVersion !== null) {
      if (args.requestedVersion < 1 || args.requestedVersion > latest) {
        return { ok: false, reason: 'VERSION_NOT_FOUND' } as const;
      }
      version = args.requestedVersion;
    }

    await client.query(
      'INSERT INTO share_link (token, scene_id, version, expires_at) VALUES ($1, $2, $3, $4)',
      [args.token, args.sceneId, version, args.expiresAt],
    );
    return { ok: true, version } as const;
  });
}

export async function getShare(pool: PgPool, token: string): Promise<ShareRow | null> {
  const result = await pool.query<ShareDbRow>(
    `SELECT sl.scene_id, sl.version, s.name, sv.doc
       FROM share_link sl
       JOIN scene s ON s.id = sl.scene_id
       JOIN scene_version sv ON sv.scene_id = sl.scene_id AND sv.version = sl.version
      WHERE sl.token = $1
        AND sl.revoked = false
        AND (sl.expires_at IS NULL OR sl.expires_at > now())`,
    [token],
  );
  const row = result.rows[0];
  if (row === undefined) {
    return null;
  }
  return {
    sceneId: row.scene_id,
    version: row.version,
    name: row.name,
    doc: row.doc as unknown as SceneDoc,
  };
}

export async function revokeShare(pool: PgPool, token: string): Promise<boolean> {
  const result = await pool.query('UPDATE share_link SET revoked = true WHERE token = $1', [token]);
  return (result.rowCount ?? 0) > 0;
}
