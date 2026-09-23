/**
 * Typed client for @overlord/api. No dependencies beyond `fetch`.
 *
 * Every method resolves to a discriminated result and NEVER throws for an HTTP error — it only
 * reports failures through `{ ok: false, error }`. Transport failures map to `NETWORK`; the
 * 10-second per-request timeout maps to `TIMEOUT`. `getShare` never sends the access key.
 */

import type { SceneDoc } from '@overlord/scene';

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
  /** HTTP status, or 0 for a transport/timeout failure. */
  status: number;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export interface ApiClientOptions {
  baseUrl: string;
  getToken: () => string;
  getAuthor?: () => string;
}

export interface HealthResponse {
  status: string;
  db: 'up' | 'down';
  commit: string | null;
  startedAt: string;
}

export interface SceneSummary {
  id: string;
  name: string;
  latestVersion: number;
  updatedAt: string;
}

export interface SceneDetail {
  id: string;
  name: string;
  latestVersion: number;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

export interface VersionMeta {
  version: number;
  parentVersion: number | null;
  createdAt: string;
  author: string;
  message: string;
  contentHash: string;
}

export interface VersionDetail extends VersionMeta {
  sceneId: string;
  doc: SceneDoc;
}

export interface ShareLink {
  token: string;
  url: string;
}

export interface ShareView {
  sceneId: string;
  version: number;
  name: string;
  doc: SceneDoc;
}

export interface CreateSceneInput {
  doc: SceneDoc;
  name?: string;
  message?: string;
}

export interface CommitVersionInput {
  doc: SceneDoc;
  message: string;
  parentVersion: number;
}

export interface CreateShareInput {
  version?: number;
  expiresInDays?: number;
}

export interface ApiClient {
  health(): Promise<ApiResult<HealthResponse>>;
  listScenes(): Promise<ApiResult<{ scenes: SceneSummary[]; nextCursor: string | null }>>;
  getScene(id: string): Promise<ApiResult<SceneDetail>>;
  listVersions(id: string): Promise<ApiResult<VersionMeta[]>>;
  getVersion(id: string, version: number | 'latest'): Promise<ApiResult<VersionDetail>>;
  createScene(input: CreateSceneInput): Promise<ApiResult<{ sceneId: string; version: number; contentHash: string }>>;
  commitVersion(id: string, input: CommitVersionInput): Promise<ApiResult<{ version: number; contentHash: string }>>;
  createShare(id: string, input: CreateShareInput): Promise<ApiResult<ShareLink>>;
  getShare(token: string): Promise<ApiResult<ShareView>>;
}

const REQUEST_TIMEOUT_MS = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const getAuthor = options.getAuthor ?? ((): string => 'unknown');

  async function request<T>(
    method: string,
    path: string,
    opts: { body?: unknown; auth: boolean },
  ): Promise<ApiResult<T>> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    const headers: Record<string, string> = {};
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (opts.auth) {
      const token = options.getToken();
      if (token !== '') {
        headers.Authorization = `Bearer ${token}`;
      }
      headers['X-Overlord-Author'] = getAuthor();
    }

    const init: RequestInit = { method, headers, signal: controller.signal };
    if (opts.body !== undefined) {
      init.body = JSON.stringify(opts.body);
    }

    try {
      const response = await fetch(`${baseUrl}${path}`, init);

      let payload: unknown = null;
      const text = await response.text();
      if (text !== '') {
        try {
          payload = JSON.parse(text) as unknown;
        } catch {
          payload = null;
        }
      }

      if (!response.ok) {
        const record = isRecord(payload) ? payload : {};
        const error: ApiError = {
          code: typeof record.error === 'string' ? record.error : 'HTTP_ERROR',
          message: typeof record.message === 'string' ? record.message : `HTTP ${response.status}`,
          status: response.status,
        };
        if (record.details !== undefined) {
          error.details = record.details;
        }
        return { ok: false, error };
      }

      return { ok: true, data: payload as T };
    } catch (error) {
      if (timedOut) {
        return {
          ok: false,
          error: {
            code: 'TIMEOUT',
            message: `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`,
            status: 0,
          },
        };
      }
      return {
        ok: false,
        error: {
          code: 'NETWORK',
          message: error instanceof Error ? error.message : 'Network request failed',
          status: 0,
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    health: () => request<HealthResponse>('GET', '/health', { auth: false }),
    listScenes: () =>
      request<{ scenes: SceneSummary[]; nextCursor: string | null }>('GET', '/scenes', { auth: true }),
    getScene: (id) => request<SceneDetail>('GET', `/scenes/${encodeURIComponent(id)}`, { auth: true }),
    listVersions: (id) =>
      request<VersionMeta[]>('GET', `/scenes/${encodeURIComponent(id)}/versions`, { auth: true }),
    getVersion: (id, version) =>
      request<VersionDetail>(
        'GET',
        `/scenes/${encodeURIComponent(id)}/versions/${version === 'latest' ? 'latest' : String(version)}`,
        { auth: true },
      ),
    createScene: (input) =>
      request<{ sceneId: string; version: number; contentHash: string }>('POST', '/scenes', {
        auth: true,
        body: { doc: input.doc, name: input.name, message: input.message },
      }),
    commitVersion: (id, input) =>
      request<{ version: number; contentHash: string }>(
        'POST',
        `/scenes/${encodeURIComponent(id)}/versions`,
        { auth: true, body: { doc: input.doc, message: input.message, parentVersion: input.parentVersion } },
      ),
    createShare: (id, input) =>
      request<ShareLink>('POST', `/scenes/${encodeURIComponent(id)}/shares`, {
        auth: true,
        body: { version: input.version, expiresInDays: input.expiresInDays },
      }),
    getShare: (token) =>
      request<ShareView>('GET', `/shares/${encodeURIComponent(token)}`, { auth: false }),
  };
}
