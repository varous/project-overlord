/** Shared fixtures for the API tests. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { SceneDoc } from '@overlord/scene';

import type { ApiConfig } from '../src/config.js';

const demoPath = fileURLToPath(
  new URL('../../../contracts/scene/v3/examples/demo-scene.json', import.meta.url),
);

export function demoDoc(): SceneDoc {
  return JSON.parse(readFileSync(demoPath, 'utf8')) as SceneDoc;
}

export function testConfig(): ApiConfig {
  return {
    databaseUrl: '',
    apiToken: 'test-token',
    port: 0,
    nodeEnv: 'test',
    corsOrigins: '*',
    publicWebUrl: 'https://example.test',
    commitSha: 'deadbeef12345678',
  };
}

export const authHeaders = { authorization: 'Bearer test-token' };
