/**
 * Immutable scene versions and scene diffing.
 */

import { canonicalJson, contentHash } from './canonical.js';
import type { ElementTypeRegistry } from './registry.js';
import type { SceneDoc, SceneVersion } from './types.js';
import { validateScene, type Issue } from './validate.js';

export class SceneError extends Error {
  readonly code: string;
  readonly issues: Issue[];

  constructor(code: string, message: string, issues: Issue[] = []) {
    super(message);
    this.name = 'SceneError';
    this.code = code;
    this.issues = issues;
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

function toIso(now: Date | string): string {
  return typeof now === 'string' ? now : now.toISOString();
}

export interface VersionOptions {
  author: string;
  message: string;
  now: Date | string;
  registry: ElementTypeRegistry;
}

export async function createInitialVersion(
  doc: SceneDoc,
  options: VersionOptions,
): Promise<SceneVersion> {
  const result = validateScene(doc, options.registry);
  if (!result.ok) {
    throw new SceneError(
      'INVALID_SCENE',
      `Cannot create a version from an invalid scene (${result.issues.length} issues)`,
      result.issues,
    );
  }

  const frozenDoc = deepFreeze(structuredClone(doc));
  return deepFreeze({
    sceneId: doc.id,
    version: 1,
    parentVersion: null,
    createdAt: toIso(options.now),
    author: options.author,
    message: options.message,
    contentHash: await contentHash(frozenDoc),
    doc: frozenDoc,
  });
}

export async function commitVersion(
  prev: SceneVersion,
  nextDoc: SceneDoc,
  options: VersionOptions,
): Promise<SceneVersion> {
  if (nextDoc.id !== prev.sceneId) {
    throw new SceneError('SCENE_ID_MISMATCH', `Scene id changed: ${prev.sceneId} -> ${nextDoc.id}`);
  }

  const result = validateScene(nextDoc, options.registry);
  if (!result.ok) {
    throw new SceneError(
      'INVALID_SCENE',
      `Cannot commit an invalid scene (${result.issues.length} issues)`,
      result.issues,
    );
  }

  const frozenDoc = deepFreeze(structuredClone(nextDoc));
  const hash = await contentHash(frozenDoc);
  if (hash === prev.contentHash) {
    throw new SceneError('NO_CHANGE', 'The scene content hash is unchanged');
  }

  return deepFreeze({
    sceneId: prev.sceneId,
    version: prev.version + 1,
    parentVersion: prev.version,
    createdAt: toIso(options.now),
    author: options.author,
    message: options.message,
    contentHash: hash,
    doc: frozenDoc,
  });
}

export interface FieldChange {
  id: string;
  fields: string[];
}

export interface CollectionDiff {
  added: string[];
  removed: string[];
  changed: FieldChange[];
}

export interface SceneDiff {
  elements: CollectionDiff;
  zones: CollectionDiff;
  siteChanged: string[];
}

const ELEMENT_FIELDS = ['typeCode', 'label', 'placement', 'size', 'params'] as const;
const ZONE_FIELDS = ['kind', 'label', 'ring'] as const;
const SITE_FIELDS = ['anchor', 'boundary', 'imagery'] as const;

function diffCollection<T extends { id: string }>(
  before: T[],
  after: T[],
  fields: readonly (keyof T)[],
): CollectionDiff {
  const beforeById = new Map(before.map((entry) => [entry.id, entry]));
  const afterById = new Map(after.map((entry) => [entry.id, entry]));

  const added = after.filter((entry) => !beforeById.has(entry.id)).map((entry) => entry.id);
  const removed = before.filter((entry) => !afterById.has(entry.id)).map((entry) => entry.id);

  const changed: FieldChange[] = [];
  for (const [id, beforeEntry] of beforeById) {
    const afterEntry = afterById.get(id);
    if (afterEntry === undefined) {
      continue;
    }
    const changedFields = fields
      .filter((field) => canonicalJson(beforeEntry[field]) !== canonicalJson(afterEntry[field]))
      .map((field) => String(field));
    if (changedFields.length > 0) {
      changed.push({ id, fields: changedFields });
    }
  }

  return { added, removed, changed };
}

export function diffScenes(before: SceneDoc, after: SceneDoc): SceneDiff {
  const siteChanged = SITE_FIELDS.filter(
    (key) => canonicalJson(before.site[key]) !== canonicalJson(after.site[key]),
  ).map((key) => String(key));

  return {
    elements: diffCollection(before.elements, after.elements, ELEMENT_FIELDS),
    zones: diffCollection(before.zones, after.zones, ZONE_FIELDS),
    siteChanged,
  };
}

/**
 * One-line human summary of a scene diff, e.g.
 * "3 elements added, 1 removed, 2 changed, site anchor changed".
 */
export function summariseDiff(diff: SceneDiff): string {
  const parts: string[] = [];

  const { added: elementsAdded, removed: elementsRemoved, changed: elementsChanged } = diff.elements;
  if (elementsAdded.length > 0) {
    parts.push(`${elementsAdded.length} element${elementsAdded.length === 1 ? '' : 's'} added`);
  }
  if (elementsRemoved.length > 0) {
    parts.push(`${elementsRemoved.length} removed`);
  }
  if (elementsChanged.length > 0) {
    parts.push(`${elementsChanged.length} changed`);
  }

  const { added: zonesAdded, removed: zonesRemoved, changed: zonesChanged } = diff.zones;
  if (zonesAdded.length > 0) {
    parts.push(`${zonesAdded.length} zone${zonesAdded.length === 1 ? '' : 's'} added`);
  }
  if (zonesRemoved.length > 0) {
    parts.push(`${zonesRemoved.length} zone${zonesRemoved.length === 1 ? '' : 's'} removed`);
  }
  if (zonesChanged.length > 0) {
    parts.push(`${zonesChanged.length} zone${zonesChanged.length === 1 ? '' : 's'} changed`);
  }

  for (const key of diff.siteChanged) {
    parts.push(`site ${key} changed`);
  }

  return parts.length === 0 ? 'no changes' : parts.join(', ');
}
