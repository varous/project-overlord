import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApiClient } from '../src/api/client.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeClient() {
  return createApiClient({
    baseUrl: 'https://api.test/',
    getToken: () => 'secret-key',
    getAuthor: () => 'Ada',
  });
}

function firstCall(fetchMock: ReturnType<typeof vi.fn>): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url: call[0], init: call[1] };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('createApiClient', () => {
  it('returns data on success and strips a trailing slash from the base URL', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { status: 'ok', db: 'up', commit: 'abcdef1', startedAt: 't0' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await makeClient().health();

    expect(result).toEqual({
      ok: true,
      data: { status: 'ok', db: 'up', commit: 'abcdef1', startedAt: 't0' },
    });
    expect(firstCall(fetchMock).url).toBe('https://api.test/health');
  });

  it('does not send the token for /health', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { status: 'ok', db: 'up', commit: null, startedAt: 't0' }));
    vi.stubGlobal('fetch', fetchMock);
    await makeClient().health();
    const headers = firstCall(fetchMock).init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('sends the bearer token and author on authenticated calls', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { scenes: [], nextCursor: null }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await makeClient().listScenes();

    expect(result.ok).toBe(true);
    const headers = firstCall(fetchMock).init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer secret-key');
    expect(headers['X-Overlord-Author']).toBe('Ada');
  });

  it('never sends the token for getShare', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { sceneId: 'scn_x', version: 1, name: 'n', doc: {} }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await makeClient().getShare('tok123');

    expect(result.ok).toBe(true);
    const headers = firstCall(fetchMock).init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(headers['X-Overlord-Author']).toBeUndefined();
    expect(firstCall(fetchMock).url).toBe('https://api.test/shares/tok123');
  });

  it('maps 401 to UNAUTHORIZED', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, { error: 'UNAUTHORIZED', message: 'nope' })));
    const result = await makeClient().createScene({ doc: {} as never });
    expect(result).toEqual({
      ok: false,
      error: { code: 'UNAUTHORIZED', message: 'nope', status: 401 },
    });
  });

  it('maps 409 VERSION_CONFLICT including details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(409, {
          error: 'VERSION_CONFLICT',
          message: 'stale',
          details: { latestVersion: 4 },
        }),
      ),
    );
    const result = await makeClient().commitVersion('scn_x', { doc: {} as never, message: 'm', parentVersion: 3 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VERSION_CONFLICT');
      expect(result.error.status).toBe(409);
      expect(result.error.details).toEqual({ latestVersion: 4 });
    }
  });

  it('maps 422 SCENE_INVALID with the issue details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(422, {
          error: 'SCENE_INVALID',
          message: 'Scene failed validation',
          details: [{ code: 'SCHEMA_VERSION', path: 'schemaVersion', message: 'bad' }],
        }),
      ),
    );
    const result = await makeClient().createScene({ doc: {} as never });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SCENE_INVALID');
      expect(result.error.details).toEqual([
        { code: 'SCHEMA_VERSION', path: 'schemaVersion', message: 'bad' },
      ]);
    }
  });

  it('maps a fetch rejection to NETWORK', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const result = await makeClient().health();
    expect(result).toEqual({
      ok: false,
      error: { code: 'NETWORK', message: 'Failed to fetch', status: 0 },
    });
  });

  it('maps a hung request to TIMEOUT after 10 seconds', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      }),
    );

    const pending = makeClient().health();
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await pending;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('TIMEOUT');
      expect(result.error.status).toBe(0);
    }
  });
});
