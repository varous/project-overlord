import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('reports every missing variable at once', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({})).toThrow(/OVERLORD_API_TOKEN/);
    expect(() => loadConfig({})).toThrow(/NODE_ENV/);
  });

  it('requires CORS_ORIGINS outside development', () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: 'postgresql://x',
        OVERLORD_API_TOKEN: 't',
        NODE_ENV: 'production',
      }),
    ).toThrow(/CORS_ORIGINS/);
  });

  it('defaults CORS_ORIGINS to "*" in development', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgresql://x',
      OVERLORD_API_TOKEN: 't',
      NODE_ENV: 'development',
    });
    expect(config.corsOrigins).toBe('*');
    expect(config.port).toBe(8080);
    expect(config.publicWebUrl).toBe('https://project-overlord-7xs.pages.dev');
    expect(config.commitSha).toBeNull();
  });

  it('parses a comma-separated CORS list and applies PORT / PUBLIC_WEB_URL defaults', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgresql://x',
      OVERLORD_API_TOKEN: 't',
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://a.example, https://*.example.dev',
      PORT: '9000',
      PUBLIC_WEB_URL: 'https://web.example',
      COMMIT_SHA: 'abcdef1234567890',
    });
    expect(config.corsOrigins).toEqual(['https://a.example', 'https://*.example.dev']);
    expect(config.port).toBe(9000);
    expect(config.publicWebUrl).toBe('https://web.example');
    expect(config.commitSha).toBe('abcdef1234567890');
  });

  it('rejects an invalid PORT', () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: 'postgresql://x',
        OVERLORD_API_TOKEN: 't',
        NODE_ENV: 'development',
        PORT: 'not-a-port',
      }),
    ).toThrow(/PORT/);
  });
});
