import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { elementTypeRegistry, type SceneDoc } from '@overlord/scene';

import type { ApplyContext } from '../src/apply.js';
import type { SceneElement, SceneZone } from '@overlord/scene';

const demoPath = fileURLToPath(
  new URL('../../../contracts/scene/v1/examples/demo-scene.json', import.meta.url),
);

/** A fresh deep copy of the valid demo scene. */
export function makeScene(): SceneDoc {
  return JSON.parse(readFileSync(demoPath, 'utf8')) as SceneDoc;
}

/** A registry + deterministic id factory. */
export function makeCtx(prefix = 'cmd'): ApplyContext {
  let counter = 0;
  return {
    registry: elementTypeRegistry,
    newId: () => `${prefix}_${++counter}`,
  };
}

export function element(doc: SceneDoc, id: string): SceneElement {
  const found = doc.elements.find((candidate) => candidate.id === id);
  if (found === undefined) {
    throw new Error(`missing element ${id}`);
  }
  return found;
}

export function zone(doc: SceneDoc, id: string): SceneZone {
  const found = doc.zones.find((candidate) => candidate.id === id);
  if (found === undefined) {
    throw new Error(`missing zone ${id}`);
  }
  return found;
}

export { elementTypeRegistry };
