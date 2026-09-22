/**
 * Element-type registry, loaded and validated from data/element-types.json.
 */

import { toTmm, type LengthUnit, type Tmm } from '@overlord/geo-core';

import rawRegistry from '../data/element-types.json' with { type: 'json' };

export interface ElementSizeDef {
  x: Tmm;
  y: Tmm;
  z: Tmm;
}

export interface OfferingMapping {
  offeringCode: string;
  expectedQuantityBasis: string;
  takeoffRule: string;
}

export interface ElementTypeDef {
  code: string;
  name: string;
  category: string;
  geometry: 'BOX' | 'FLAT';
  defaultSize: ElementSizeDef;
  minSize: ElementSizeDef;
  maxSize: ElementSizeDef;
  defaultCount: number;
  color: string;
  source: string;
  offeringMappings: OfferingMapping[];
}

export type ElementTypeRegistry = ReadonlyMap<string, ElementTypeDef>;

const LENGTH_UNITS = new Set(['m', 'cm', 'mm', 'ft', 'in']);
const AXES = ['x', 'y', 'z'] as const;

function toAxis(value: unknown, label: string): Tmm {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(`element-types: ${label} must be [decimalString, unit]`);
  }
  const amount = value[0];
  const unit = value[1];
  if (typeof amount !== 'string' || typeof unit !== 'string' || !LENGTH_UNITS.has(unit)) {
    throw new Error(`element-types: ${label} must be [decimalString, unit]`);
  }
  return toTmm(amount, unit as LengthUnit, { allowNegative: true });
}

function toSize(value: unknown, label: string): ElementSizeDef {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`element-types: ${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  return {
    x: toAxis(record.x, `${label}.x`),
    y: toAxis(record.y, `${label}.y`),
    z: toAxis(record.z, `${label}.z`),
  };
}

function toOfferingMappings(value: unknown, code: string): OfferingMapping[] {
  if (!Array.isArray(value)) {
    throw new Error(`element-types: ${code}.offeringMappings must be an array`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`element-types: ${code}.offeringMappings[${index}] must be an object`);
    }
    const record = entry as Record<string, unknown>;
    if (
      typeof record.offeringCode !== 'string' ||
      typeof record.expectedQuantityBasis !== 'string' ||
      typeof record.takeoffRule !== 'string'
    ) {
      throw new Error(`element-types: ${code}.offeringMappings[${index}] has invalid fields`);
    }
    return {
      offeringCode: record.offeringCode,
      expectedQuantityBasis: record.expectedQuantityBasis,
      takeoffRule: record.takeoffRule,
    };
  });
}

function parseType(value: unknown, index: number): ElementTypeDef {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`element-types: types[${index}] must be an object`);
  }
  const record = value as Record<string, unknown>;
  if (typeof record.code !== 'string' || record.code.length === 0) {
    throw new Error(`element-types: types[${index}].code is required`);
  }
  if (record.geometry !== 'BOX' && record.geometry !== 'FLAT') {
    throw new Error(`element-types: ${record.code}.geometry must be BOX or FLAT`);
  }

  const code = record.code;
  const geometry = record.geometry;
  const defaultSize = toSize(record.defaultSize, `${code}.defaultSize`);
  const minSize = toSize(record.minSize, `${code}.minSize`);
  const maxSize = toSize(record.maxSize, `${code}.maxSize`);

  for (const axis of AXES) {
    if (!(minSize[axis] <= defaultSize[axis] && defaultSize[axis] <= maxSize[axis])) {
      throw new Error(`element-types: ${code}.${axis} must satisfy min <= default <= max`);
    }
  }

  if (geometry === 'FLAT' && (defaultSize.z !== 0 || minSize.z !== 0 || maxSize.z !== 0)) {
    throw new Error(`element-types: FLAT type ${code} must have z = 0`);
  }

  if (typeof record.name !== 'string' || typeof record.category !== 'string') {
    throw new Error(`element-types: ${code}.name and .category are required`);
  }
  if (typeof record.defaultCount !== 'number' || !Number.isSafeInteger(record.defaultCount)) {
    throw new Error(`element-types: ${code}.defaultCount must be an integer`);
  }
  if (typeof record.color !== 'string') {
    throw new Error(`element-types: ${code}.color is required`);
  }
  if (typeof record.source !== 'string') {
    throw new Error(`element-types: ${code}.source is required`);
  }

  return {
    code,
    name: record.name,
    category: record.category,
    geometry,
    defaultSize,
    minSize,
    maxSize,
    defaultCount: record.defaultCount,
    color: record.color,
    source: record.source,
    offeringMappings: toOfferingMappings(record.offeringMappings, code),
  };
}

export function loadElementTypeRegistry(raw: unknown = rawRegistry): ElementTypeRegistry {
  const types = (raw as { types?: unknown }).types;
  if (!Array.isArray(types)) {
    throw new Error('element-types: expected a top-level "types" array');
  }
  const registry = new Map<string, ElementTypeDef>();
  for (const [index, entry] of types.entries()) {
    const definition = parseType(entry, index);
    if (registry.has(definition.code)) {
      throw new Error(`element-types: duplicate code "${definition.code}"`);
    }
    registry.set(definition.code, definition);
  }
  return registry;
}

/** The seeded registry. */
export const elementTypeRegistry: ElementTypeRegistry = loadElementTypeRegistry();
