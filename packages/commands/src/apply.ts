/**
 * Command application. PURE module: it never mutates the input document and creates no Cesium/DOM
 * state. Every successful command returns its exact inverse, so undo is just applying the inverse.
 *
 * Element field commands carry an optional `provenance`/`note` so their inverses can restore the
 * previous provenance and note exactly (a plain edit sets the field to STATED, keeping any note).
 */

import {
  isSimpleRing,
  signedArea2,
  sourced,
  type LocalPoint,
  type Provenance,
  type Sourced,
  type Tmm,
} from '@overlord/geo-core';
import {
  validateScene,
  type ElementSize,
  type ElementTypeDef,
  type ElementTypeRegistry,
  type Ring2,
  type SceneDoc,
  type SceneElement,
  type SceneZone,
} from '@overlord/scene';

import { normalizeAngleDeg } from './snapping.js';
import type { Command, CommandError } from './types.js';

export interface ApplyContext {
  registry: ElementTypeRegistry;
  newId: () => string;
}

export type ApplyResult =
  | { ok: true; doc: SceneDoc; inverse: Command }
  | { ok: false; error: CommandError };

export type ApplyCommandsResult =
  | { ok: true; doc: SceneDoc; inverses: Command[] }
  | { ok: false; error: CommandError; index: number; doc: SceneDoc };

const AXES = ['x', 'y', 'z'] as const;

function fail(code: CommandError['code'], message: string, details?: unknown): ApplyResult {
  const error: CommandError = { code, message };
  if (details !== undefined) {
    error.details = details;
  }
  return { ok: false, error };
}

/** Wrap a value with provenance, preserving an optional note only when it exists. */
function restate<T>(value: T, provenance: Provenance, note: string | undefined): Sourced<T> {
  return note === undefined ? sourced(value, provenance) : sourced(value, provenance, note);
}

/** Optional provenance/note fields, omitted when undefined (exactOptionalPropertyTypes). */
function optionalFields(provenance: Provenance, note: string | undefined): { provenance: Provenance; note?: string } {
  return note === undefined ? { provenance } : { provenance, note };
}

function cloneDoc(doc: SceneDoc): SceneDoc {
  return structuredClone(doc);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function insertAt<T>(items: T[], item: T, index: number | undefined): void {
  if (index === undefined) {
    items.push(item);
    return;
  }
  items.splice(clamp(index, 0, items.length), 0, item);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function idTaken(doc: SceneDoc, id: string): boolean {
  return (
    doc.elements.some((element) => element.id === id) ||
    doc.zones.some((zone) => zone.id === id) ||
    doc.viewpoints.some((viewpoint) => viewpoint.id === id)
  );
}

function ringIssue(ring: Ring2): CommandError | null {
  if (!Array.isArray(ring) || ring.length < 3) {
    return { code: 'RING_INVALID', message: 'A ring must have at least 3 points.' };
  }
  if (!isSimpleRing(ring)) {
    return { code: 'RING_INVALID', message: 'A ring must be simple (it must not self-intersect).' };
  }
  if (signedArea2(ring) <= 0) {
    return { code: 'RING_INVALID', message: 'A ring must be counter-clockwise.' };
  }
  return null;
}

function sizeIssue(def: ElementTypeDef, size: ElementSize): CommandError | null {
  for (const axis of AXES) {
    if (size[axis] < def.minSize[axis] || size[axis] > def.maxSize[axis]) {
      return {
        code: 'SIZE_OUT_OF_BOUNDS',
        message: `${axis} must be within [${def.minSize[axis]}, ${def.maxSize[axis]}] tmm for ${def.code}.`,
      };
    }
  }
  return null;
}

/** "Main stage 3" — the next free number for that type. */
function nextFreeLabel(doc: SceneDoc, typeName: string): string {
  const pattern = new RegExp(`^${escapeRegExp(typeName)} (\\d+)$`);
  let max = 0;
  for (const element of doc.elements) {
    const match = pattern.exec(element.label);
    if (match !== null) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value > max) {
        max = value;
      }
    }
  }
  return `${typeName} ${max + 1}`;
}

function requireElement(
  doc: SceneDoc,
  id: string,
): { index: number; element: SceneElement } | { error: CommandError } {
  const index = doc.elements.findIndex((element) => element.id === id);
  const element = index < 0 ? undefined : doc.elements[index];
  if (element === undefined) {
    return { error: { code: 'ELEMENT_NOT_FOUND', message: `No element with id "${id}".` } };
  }
  return { index, element };
}

function requireZone(
  doc: SceneDoc,
  id: string,
): { index: number; zone: SceneZone } | { error: CommandError } {
  const index = doc.zones.findIndex((zone) => zone.id === id);
  const zone = index < 0 ? undefined : doc.zones[index];
  if (zone === undefined) {
    return { error: { code: 'ZONE_NOT_FOUND', message: `No zone with id "${id}".` } };
  }
  return { index, zone };
}

function finish(next: SceneDoc, inverse: Command, registry: ElementTypeRegistry): ApplyResult {
  const result = validateScene(next, registry);
  if (!result.ok) {
    return fail('WOULD_INVALIDATE', 'The command would produce an invalid scene.', result.issues);
  }
  return { ok: true, doc: next, inverse };
}

export function applyCommand(doc: SceneDoc, command: Command, ctx: ApplyContext): ApplyResult {
  switch (command.type) {
    case 'ADD_ELEMENT': {
      const def = ctx.registry.get(command.typeCode);
      if (def === undefined) {
        return fail('UNKNOWN_TYPE', `Unknown element type "${command.typeCode}".`);
      }
      const id = command.id ?? ctx.newId();
      if (idTaken(doc, id)) {
        return fail('DUPLICATE_ID', `Id "${id}" is already used in this scene.`);
      }
      const size = command.size ?? def.defaultSize;
      const bounds = sizeIssue(def, size);
      if (bounds !== null) {
        return fail(bounds.code, bounds.message);
      }
      const element: SceneElement = {
        id,
        typeCode: command.typeCode,
        label: command.label ?? nextFreeLabel(doc, def.name),
        placement: sourced(
          { center: command.center, rotationDeg: normalizeAngleDeg(command.rotationDeg ?? 0) },
          command.provenance,
        ),
        size: sourced(size, command.sizeProvenance ?? command.provenance),
        params: {},
      };
      const next = cloneDoc(doc);
      insertAt(next.elements, element, command.index);
      return finish(next, { type: 'DELETE_ELEMENT', id }, ctx.registry);
    }

    case 'MOVE_ELEMENT_ABSOLUTE': {
      const found = requireElement(doc, command.id);
      if ('error' in found) {
        return fail(found.error.code, found.error.message);
      }
      const { index, element } = found;
      const previous = element.placement.value;
      const next = cloneDoc(doc);
      const target = next.elements[index];
      if (target === undefined) {
        return fail('ELEMENT_NOT_FOUND', `No element with id "${command.id}".`);
      }
      next.elements[index] = {
        ...target,
        placement: restate(
          { center: command.center, rotationDeg: previous.rotationDeg },
          command.provenance ?? 'STATED',
          command.note ?? element.placement.note,
        ),
      };
      const inverse: Command = {
        type: 'MOVE_ELEMENT_ABSOLUTE',
        id: command.id,
        center: previous.center,
        ...optionalFields(element.placement.provenance, element.placement.note),
      };
      return finish(next, inverse, ctx.registry);
    }

    case 'MOVE_ELEMENT_RELATIVE': {
      const found = requireElement(doc, command.id);
      if ('error' in found) {
        return fail(found.error.code, found.error.message);
      }
      const { index, element } = found;
      const previous = element.placement.value;
      const dz = command.delta.z ?? 0;
      const moved = {
        x: previous.center.x + command.delta.x,
        y: previous.center.y + command.delta.y,
        z: previous.center.z + dz,
      } as unknown as LocalPoint;
      const next = cloneDoc(doc);
      const target = next.elements[index];
      if (target === undefined) {
        return fail('ELEMENT_NOT_FOUND', `No element with id "${command.id}".`);
      }
      next.elements[index] = {
        ...target,
        placement: restate(
          { center: moved, rotationDeg: previous.rotationDeg },
          command.provenance ?? 'STATED',
          command.note ?? element.placement.note,
        ),
      };
      const inverse: Command = {
        type: 'MOVE_ELEMENT_RELATIVE',
        id: command.id,
        delta: { x: -command.delta.x as Tmm, y: -command.delta.y as Tmm, z: -dz as Tmm },
        ...optionalFields(element.placement.provenance, element.placement.note),
      };
      return finish(next, inverse, ctx.registry);
    }

    case 'ROTATE_ELEMENT': {
      const found = requireElement(doc, command.id);
      if ('error' in found) {
        return fail(found.error.code, found.error.message);
      }
      const { index, element } = found;
      const previous = element.placement.value;
      const next = cloneDoc(doc);
      const target = next.elements[index];
      if (target === undefined) {
        return fail('ELEMENT_NOT_FOUND', `No element with id "${command.id}".`);
      }
      next.elements[index] = {
        ...target,
        placement: restate(
          { center: previous.center, rotationDeg: normalizeAngleDeg(command.rotationDeg) },
          command.provenance ?? 'STATED',
          command.note ?? element.placement.note,
        ),
      };
      const inverse: Command = {
        type: 'ROTATE_ELEMENT',
        id: command.id,
        rotationDeg: previous.rotationDeg,
        ...optionalFields(element.placement.provenance, element.placement.note),
      };
      return finish(next, inverse, ctx.registry);
    }

    case 'RESIZE_ELEMENT': {
      const found = requireElement(doc, command.id);
      if ('error' in found) {
        return fail(found.error.code, found.error.message);
      }
      const { index, element } = found;
      const def = ctx.registry.get(element.typeCode);
      if (def === undefined) {
        return fail('UNKNOWN_TYPE', `Unknown element type "${element.typeCode}".`);
      }
      const bounds = sizeIssue(def, command.size);
      if (bounds !== null) {
        return fail(bounds.code, bounds.message);
      }
      const previous = element.size.value;
      const next = cloneDoc(doc);
      const target = next.elements[index];
      if (target === undefined) {
        return fail('ELEMENT_NOT_FOUND', `No element with id "${command.id}".`);
      }
      next.elements[index] = {
        ...target,
        size: restate(command.size, command.provenance ?? 'STATED', command.note ?? element.size.note),
      };
      const inverse: Command = {
        type: 'RESIZE_ELEMENT',
        id: command.id,
        size: previous,
        ...optionalFields(element.size.provenance, element.size.note),
      };
      return finish(next, inverse, ctx.registry);
    }

    case 'DELETE_ELEMENT': {
      const found = requireElement(doc, command.id);
      if ('error' in found) {
        return fail(found.error.code, found.error.message);
      }
      const { index, element } = found;
      const next = cloneDoc(doc);
      next.elements.splice(index, 1);
      const inverse: Command = {
        type: 'ADD_ELEMENT',
        typeCode: element.typeCode,
        id: element.id,
        label: element.label,
        center: element.placement.value.center,
        rotationDeg: element.placement.value.rotationDeg,
        size: element.size.value,
        provenance: element.placement.provenance,
        sizeProvenance: element.size.provenance,
        index,
      };
      return finish(next, inverse, ctx.registry);
    }

    case 'SET_ELEMENT_LABEL': {
      const found = requireElement(doc, command.id);
      if ('error' in found) {
        return fail(found.error.code, found.error.message);
      }
      const { index, element } = found;
      const next = cloneDoc(doc);
      const target = next.elements[index];
      if (target === undefined) {
        return fail('ELEMENT_NOT_FOUND', `No element with id "${command.id}".`);
      }
      next.elements[index] = { ...target, label: command.label };
      return finish(
        next,
        { type: 'SET_ELEMENT_LABEL', id: command.id, label: element.label },
        ctx.registry,
      );
    }

    case 'ADD_ZONE': {
      const bad = ringIssue(command.ring);
      if (bad !== null) {
        return fail(bad.code, bad.message);
      }
      const id = command.id ?? ctx.newId();
      if (idTaken(doc, id)) {
        return fail('DUPLICATE_ID', `Id "${id}" is already used in this scene.`);
      }
      const zone: SceneZone = {
        id,
        kind: command.kind,
        label: command.label,
        ring: restate(command.ring, command.provenance ?? 'STATED', command.note),
      };
      const next = cloneDoc(doc);
      insertAt(next.zones, zone, command.index);
      return finish(next, { type: 'DELETE_ZONE', id }, ctx.registry);
    }

    case 'SET_ZONE_RING': {
      const found = requireZone(doc, command.id);
      if ('error' in found) {
        return fail(found.error.code, found.error.message);
      }
      const { index, zone } = found;
      const bad = ringIssue(command.ring);
      if (bad !== null) {
        return fail(bad.code, bad.message);
      }
      const next = cloneDoc(doc);
      const target = next.zones[index];
      if (target === undefined) {
        return fail('ZONE_NOT_FOUND', `No zone with id "${command.id}".`);
      }
      next.zones[index] = {
        ...target,
        ring: restate(command.ring, command.provenance ?? 'STATED', command.note),
      };
      const inverse: Command = {
        type: 'SET_ZONE_RING',
        id: command.id,
        ring: zone.ring.value,
        ...optionalFields(zone.ring.provenance, zone.ring.note),
      };
      return finish(next, inverse, ctx.registry);
    }

    case 'DELETE_ZONE': {
      const found = requireZone(doc, command.id);
      if ('error' in found) {
        return fail(found.error.code, found.error.message);
      }
      const { index, zone } = found;
      const next = cloneDoc(doc);
      next.zones.splice(index, 1);
      const inverse: Command = {
        type: 'ADD_ZONE',
        kind: zone.kind,
        label: zone.label,
        ring: zone.ring.value,
        id: zone.id,
        ...optionalFields(zone.ring.provenance, zone.ring.note),
        index,
      };
      return finish(next, inverse, ctx.registry);
    }

    case 'SET_SITE_ANCHOR': {
      const previous = doc.site.anchor;
      const next = cloneDoc(doc);
      next.site = {
        ...next.site,
        anchor: restate(command.anchor, command.provenance ?? 'STATED', command.note),
      };
      const inverse: Command = {
        type: 'SET_SITE_ANCHOR',
        anchor: previous.value,
        ...optionalFields(previous.provenance, previous.note),
      };
      return finish(next, inverse, ctx.registry);
    }

    case 'SET_SCENE_NAME': {
      const previous = doc.name;
      const next = cloneDoc(doc);
      next.name = command.name;
      return finish(next, { type: 'SET_SCENE_NAME', name: previous }, ctx.registry);
    }

    case 'REPLACE_CONTENT': {
      const previousElements = doc.elements;
      const previousZones = doc.zones;
      const next = cloneDoc(doc);
      next.elements = structuredClone(command.elements);
      next.zones = structuredClone(command.zones);
      const inverse: Command = {
        type: 'REPLACE_CONTENT',
        elements: previousElements,
        zones: previousZones,
      };
      return finish(next, inverse, ctx.registry);
    }
  }
}

/**
 * Apply commands in order, all-or-nothing. On the first failure the ORIGINAL document is returned
 * along with the index that failed.
 */
export function applyCommands(
  doc: SceneDoc,
  commands: readonly Command[],
  ctx: ApplyContext,
): ApplyCommandsResult {
  let current = doc;
  const inverses: Command[] = [];
  for (const [index, command] of commands.entries()) {
    const result = applyCommand(current, command, ctx);
    if (!result.ok) {
      return { ok: false, error: result.error, index, doc };
    }
    current = result.doc;
    inverses.push(result.inverse);
  }
  return { ok: true, doc: current, inverses };
}
