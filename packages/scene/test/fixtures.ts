import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { SceneDoc } from '../src/index.js';

const demoPath = fileURLToPath(
  new URL('../../../contracts/scene/v1/examples/demo-scene.json', import.meta.url),
);

/** A fresh, deep copy of the demo scene for each call. */
export function makeScene(): SceneDoc {
  return JSON.parse(readFileSync(demoPath, 'utf8')) as SceneDoc;
}

export function demoScenePath(): string {
  return demoPath;
}
