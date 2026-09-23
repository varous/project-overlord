/**
 * Environment configuration, read once at startup. A clear error names every missing variable.
 */

export interface ApiConfig {
  databaseUrl: string;
  apiToken: string;
  port: number;
  nodeEnv: string;
  /** '*' means allow any origin; otherwise a list of patterns (a '*' in a pattern is a wildcard). */
  corsOrigins: '*' | string[];
  publicWebUrl: string;
  commitSha: string | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const missing: string[] = [];

  const databaseUrl = env.DATABASE_URL ?? '';
  if (databaseUrl === '') {
    missing.push('DATABASE_URL');
  }

  const apiToken = env.OVERLORD_API_TOKEN ?? '';
  if (apiToken === '') {
    missing.push('OVERLORD_API_TOKEN');
  }

  const nodeEnv = env.NODE_ENV ?? '';
  if (nodeEnv === '') {
    missing.push('NODE_ENV');
  }

  const portRaw = env.PORT ?? '8080';
  const port = Number(portRaw);

  let corsOrigins: '*' | string[];
  const corsRaw = env.CORS_ORIGINS;
  if (corsRaw === undefined) {
    if (nodeEnv === 'development') {
      corsOrigins = '*';
    } else {
      corsOrigins = [];
      missing.push('CORS_ORIGINS');
    }
  } else {
    corsOrigins =
      corsRaw.trim() === '*'
        ? '*'
        : corsRaw
            .split(',')
            .map((origin) => origin.trim())
            .filter((origin) => origin.length > 0);
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535, got "${portRaw}"`);
  }

  return {
    databaseUrl,
    apiToken,
    port,
    nodeEnv,
    corsOrigins,
    publicWebUrl: env.PUBLIC_WEB_URL ?? 'https://project-overlord-7xs.pages.dev',
    // Render injects RENDER_GIT_COMMIT automatically; COMMIT_SHA is the explicit override.
    commitSha: env.COMMIT_SHA ?? env.RENDER_GIT_COMMIT ?? null,
  };
}
