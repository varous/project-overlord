/**
 * Fastify app: scenes, versions and share links over Postgres.
 *
 * Validation is the SAME code the browser runs: @overlord/scene's validateScene + contentHash.
 * (@overlord/geo-core is a declared dependency and build reference because the scene model's types
 * originate there; this service performs no geometry of its own, so it never duplicates a rule.)
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import cors from '@fastify/cors';
import { contentHash, elementTypeRegistry, validateScene, type SceneDoc } from '@overlord/scene';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';

import { isAuthorized } from './auth.js';
import { loadConfig, type ApiConfig } from './config.js';
import { createPool, databaseUp, runMigrations, type PgPool } from './db.js';
import { errorBody } from './errors.js';
import { newSceneId, newShareToken } from './ids.js';
import {
  commitVersionGuarded,
  createScene,
  createShareGuarded,
  getLatestVersion,
  getScene,
  getShare,
  getVersion,
  listScenes,
  listVersions,
  revokeShare,
  type SceneRow,
} from './repo.js';

function encodeCursor(date: Date): string {
  return Buffer.from(date.toISOString(), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): Date | null {
  try {
    const date = new Date(Buffer.from(cursor, 'base64url').toString('utf8'));
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function originMatches(pattern: string, origin: string): boolean {
  const regex = new RegExp(`^${pattern.split('*').map(escapeRegExp).join('.*')}$`);
  return regex.test(origin);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Structural guard: validateScene assumes a scene-shaped object, so reject anything else first. */
function coerceSceneDoc(value: unknown): SceneDoc | null {
  if (!isRecord(value)) {
    return null;
  }
  if (!Array.isArray(value.elements) || !Array.isArray(value.zones) || !Array.isArray(value.viewpoints)) {
    return null;
  }
  if (!isRecord(value.site)) {
    return null;
  }
  return value as unknown as SceneDoc;
}

function versionMeta(row: { version: number; parentVersion: number | null; createdAt: Date; author: string; message: string; contentHash: string }) {
  return {
    version: row.version,
    parentVersion: row.parentVersion,
    createdAt: row.createdAt.toISOString(),
    author: row.author,
    message: row.message,
    contentHash: row.contentHash,
  };
}

function sceneSummary(row: SceneRow) {
  return {
    id: row.id,
    name: row.name,
    latestVersion: row.latestVersion,
    updatedAt: row.updatedAt.toISOString(),
  };
}

interface CreateSceneBody {
  doc?: unknown;
  name?: unknown;
  message?: unknown;
}

interface CreateVersionBody {
  doc?: unknown;
  message?: unknown;
  parentVersion?: unknown;
}

interface CreateShareBody {
  version?: unknown;
  expiresInDays?: unknown;
}

export interface BuildServerOptions {
  config: ApiConfig;
  pool: PgPool;
  logger?: boolean;
}

export async function buildServer(options: BuildServerOptions): Promise<FastifyInstance> {
  const { config, pool } = options;
  const startedAt = new Date().toISOString();

  const app = Fastify({ logger: options.logger ?? true });

  await app.register(cors, {
    origin:
      config.corsOrigins === '*'
        ? '*'
        : (origin: string | undefined, callback: (error: Error | null, allow: boolean) => void) => {
            if (origin === undefined) {
              callback(null, true);
              return;
            }
            const allowed = config.corsOrigins !== '*' && config.corsOrigins.some((pattern) => originMatches(pattern, origin));
            callback(null, allowed);
          },
    allowedHeaders: ['Authorization', 'X-Overlord-Author', 'Content-Type'],
  });

  app.addHook('onRequest', async (request, reply) => {
    if (request.method === 'OPTIONS') {
      return;
    }
    const requestPath = request.url.split('?')[0] ?? '';
    if (requestPath === '/health' || requestPath.startsWith('/shares/')) {
      return;
    }
    if (!isAuthorized(request.headers.authorization, config.apiToken)) {
      return reply.code(401).send(errorBody('UNAUTHORIZED', 'Missing or invalid bearer token'));
    }
    return undefined;
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error(error);
    const status = error.statusCode ?? 500;
    if (status >= 500) {
      return reply.code(status).send(errorBody('INTERNAL', 'Internal server error'));
    }
    return reply.code(status).send(errorBody('REQUEST_ERROR', error.message));
  });

  app.get('/health', async (request, reply) => {
    const up = await databaseUp(pool);
    if (!up) {
      request.log.error('GET /health: database is unreachable');
    }
    return reply.send({
      status: 'ok',
      db: up ? 'up' : 'down',
      commit: config.commitSha,
      startedAt,
    });
  });

  app.post('/scenes', async (request, reply) => {
    const body = (request.body ?? {}) as CreateSceneBody;
    const sceneDoc = coerceSceneDoc(body.doc);
    if (sceneDoc === null) {
      return reply.code(422).send(errorBody('SCENE_INVALID', 'doc must be a scene object with site, elements, zones and viewpoints'));
    }

    const result = validateScene(sceneDoc, elementTypeRegistry);
    if (!result.ok) {
      return reply.code(422).send(errorBody('SCENE_INVALID', 'Scene failed validation', result.issues));
    }

    const sceneId = newSceneId();
    const stored: SceneDoc = { ...sceneDoc, id: sceneId };
    const hash = await contentHash(stored);
    const author = typeof request.headers['x-overlord-author'] === 'string' ? request.headers['x-overlord-author'] : 'unknown';
    const name = typeof body.name === 'string' && body.name.length > 0 ? body.name : sceneDoc.name;
    const message = typeof body.message === 'string' && body.message.length > 0 ? body.message : 'create';

    await createScene(pool, { id: sceneId, name, author, message, hash, doc: stored });

    return reply.code(201).send({ sceneId, version: 1, contentHash: hash });
  });

  app.get('/scenes', async (request, reply) => {
    const query = (request.query ?? {}) as { limit?: string; cursor?: string; archived?: string };
    const limit = query.limit === undefined ? 20 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return reply.code(400).send(errorBody('INVALID_LIMIT', 'limit must be an integer between 1 and 100'));
    }

    let cursor: Date | null = null;
    if (query.cursor !== undefined) {
      cursor = decodeCursor(query.cursor);
      if (cursor === null) {
        return reply.code(400).send(errorBody('INVALID_CURSOR', 'cursor is not a valid pagination cursor'));
      }
    }

    const page = await listScenes(pool, limit, cursor, query.archived === '1');
    return reply.send({
      scenes: page.scenes.map(sceneSummary),
      nextCursor: page.nextCursor === null ? null : encodeCursor(page.nextCursor),
    });
  });

  app.get('/scenes/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const scene = await getScene(pool, id);
    if (scene === null) {
      return reply.code(404).send(errorBody('SCENE_NOT_FOUND', `No scene with id "${id}"`));
    }
    return reply.send({
      id: scene.id,
      name: scene.name,
      latestVersion: scene.latestVersion,
      createdAt: scene.createdAt.toISOString(),
      updatedAt: scene.updatedAt.toISOString(),
      archived: scene.archived,
    });
  });

  app.get('/scenes/:id/versions', async (request, reply) => {
    const { id } = request.params as { id: string };
    const scene = await getScene(pool, id);
    if (scene === null) {
      return reply.code(404).send(errorBody('SCENE_NOT_FOUND', `No scene with id "${id}"`));
    }
    const versions = await listVersions(pool, id);
    return reply.send(versions.map(versionMeta));
  });

  app.get('/scenes/:id/versions/:version', async (request, reply) => {
    const { id, version: rawVersion } = request.params as { id: string; version: string };
    const scene = await getScene(pool, id);
    if (scene === null) {
      return reply.code(404).send(errorBody('SCENE_NOT_FOUND', `No scene with id "${id}"`));
    }

    let version: number;
    if (rawVersion === 'latest') {
      const latest = await getLatestVersion(pool, id);
      if (latest === null) {
        return reply.code(404).send(errorBody('VERSION_NOT_FOUND', `Scene "${id}" has no versions`));
      }
      version = latest;
    } else {
      version = Number(rawVersion);
      if (!Number.isInteger(version) || version < 1) {
        return reply.code(400).send(errorBody('INVALID_VERSION', 'version must be a positive integer or "latest"'));
      }
    }

    const row = await getVersion(pool, id, version);
    if (row === null) {
      return reply.code(404).send(errorBody('VERSION_NOT_FOUND', `Scene "${id}" has no version ${version}`));
    }
    return reply.send({
      sceneId: id,
      version: row.version,
      parentVersion: row.parentVersion,
      createdAt: row.createdAt.toISOString(),
      author: row.author,
      message: row.message,
      contentHash: row.contentHash,
      doc: row.doc,
    });
  });

  app.post('/scenes/:id/versions', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as CreateVersionBody;

    const sceneDoc = coerceSceneDoc(body.doc);
    if (sceneDoc === null) {
      return reply.code(422).send(errorBody('SCENE_INVALID', 'doc must be a scene object with site, elements, zones and viewpoints'));
    }

    if (!Number.isInteger(body.parentVersion)) {
      return reply.code(400).send(errorBody('INVALID_PARENT_VERSION', 'parentVersion must be an integer'));
    }
    const parentVersion = body.parentVersion as number;

    const result = validateScene(sceneDoc, elementTypeRegistry);
    if (!result.ok) {
      return reply.code(422).send(errorBody('SCENE_INVALID', 'Scene failed validation', result.issues));
    }

    const stored: SceneDoc = { ...sceneDoc, id };
    const hash = await contentHash(stored);
    const author = typeof request.headers['x-overlord-author'] === 'string' ? request.headers['x-overlord-author'] : 'unknown';
    const message = typeof body.message === 'string' ? body.message : '';

    // The lock + latest-version re-read + parentVersion re-check all happen inside this transaction.
    const committed = await commitVersionGuarded(pool, {
      sceneId: id,
      parentVersion,
      author,
      message,
      hash,
      doc: stored,
      sceneName: sceneDoc.name,
    });

    if (!committed.ok) {
      if (committed.reason === 'NOT_FOUND') {
        return reply.code(404).send(errorBody('SCENE_NOT_FOUND', `No scene with id "${id}"`));
      }
      if (committed.reason === 'CONFLICT') {
        return reply
          .code(409)
          .send(errorBody('VERSION_CONFLICT', 'parentVersion does not match the latest version', { latestVersion: committed.latestVersion }));
      }
      return reply.code(409).send(errorBody('NO_CHANGE', 'The new scene content is identical to the parent version'));
    }

    return reply.code(201).send({ version: committed.version, contentHash: hash });
  });

  app.post('/scenes/:id/shares', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as CreateShareBody;

    let requestedVersion: number | null = null;
    if (body.version !== undefined) {
      if (!Number.isInteger(body.version)) {
        return reply.code(400).send(errorBody('INVALID_VERSION', 'version must be an integer'));
      }
      requestedVersion = body.version as number;
    }

    const expiresInDays: unknown = body.expiresInDays === undefined ? 30 : body.expiresInDays;
    if (!Number.isInteger(expiresInDays) || (expiresInDays as number) < 0) {
      return reply.code(400).send(errorBody('INVALID_EXPIRY', 'expiresInDays must be a non-negative integer'));
    }
    const expiresAt: Date | null =
      expiresInDays === 0 ? null : new Date(Date.now() + (expiresInDays as number) * 86_400_000);

    const token = newShareToken();
    // Latest version is resolved inside this transaction, under the same scene row lock as commits.
    const created = await createShareGuarded(pool, { token, sceneId: id, requestedVersion, expiresAt });

    if (!created.ok) {
      if (created.reason === 'NOT_FOUND') {
        return reply.code(404).send(errorBody('SCENE_NOT_FOUND', `No scene with id "${id}"`));
      }
      return reply.code(404).send(errorBody('VERSION_NOT_FOUND', `Scene "${id}" has no such version`));
    }

    return reply.code(201).send({ token, url: `${config.publicWebUrl}/?share=${token}` });
  });

  app.get('/shares/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const share = await getShare(pool, token);
    if (share === null) {
      return reply.code(404).send(errorBody('SHARE_NOT_FOUND', 'Share link is missing, revoked or expired'));
    }
    return reply.send({
      sceneId: share.sceneId,
      version: share.version,
      name: share.name,
      doc: share.doc,
    });
  });

  app.delete('/shares/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const revoked = await revokeShare(pool, token);
    if (!revoked) {
      return reply.code(404).send(errorBody('SHARE_NOT_FOUND', `No share with token "${token}"`));
    }
    return reply.code(204).send();
  });

  return app;
}

async function start(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config.databaseUrl);
  const applied = await runMigrations(pool, new URL('../migrations/', import.meta.url));
  if (applied.length > 0) {
    console.log(`Applied migrations: ${applied.join(', ')}`);
  }
  const app = await buildServer({ config, pool });
  await app.listen({ port: config.port, host: '0.0.0.0' });
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  void start().catch((error: unknown) => {
    console.error('Fatal startup error:', error);
    process.exitCode = 1;
  });
}
