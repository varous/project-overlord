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

export interface SizePreset {
  label: string;
  size: ElementSizeDef;
  source: string;
}

/** A LINEAR type's segmenting rule. Quantity is running feet (RFT) or running metres (RM). */
export interface LinearSpec {
  segmentLength: Tmm;
  defaultWidth: Tmm;
  unit: 'RFT' | 'RM';
}

export interface ParamSpec {
  name: string;
  type: 'number' | 'enum';
  values?: string[];
  default: number | string;
  unit?: string;
}

export interface ElementTypeDef {
  code: string;
  name: string;
  category: string;
  geometry: 'BOX' | 'FLAT' | 'LINEAR';
  /** Zero for LINEAR types (they carry a `linear` block instead). */
  defaultSize: ElementSizeDef;
  minSize: ElementSizeDef;
  maxSize: ElementSizeDef;
  defaultCount: number;
  color: string;
  source: string;
  /** Words this thing is called in drawings, WhatsApp and speech. */
  aliases: string[];
  sizePresets: SizePreset[];
  paramSpec: ParamSpec[];
  regionTags: string[];
  eventTypeTags: string[];
  linear: LinearSpec | null;
  offeringMappings: OfferingMapping[];
}

export type ElementTypeRegistry = ReadonlyMap<string, ElementTypeDef>;

const LENGTH_UNITS = new Set(['m', 'cm', 'mm', 'ft', 'in']);
const AXES = ['x', 'y', 'z'] as const;
const ZERO_SIZE: ElementSizeDef = { x: 0 as Tmm, y: 0 as Tmm, z: 0 as Tmm };
const ALIAS_PATTERN = /^[a-z0-9 ]+$/;

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`element-types: ${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

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
  const record = asRecord(value, label);
  return {
    x: toAxis(record.x, `${label}.x`),
    y: toAxis(record.y, `${label}.y`),
    z: toAxis(record.z, `${label}.z`),
  };
}

function sameSize(a: ElementSizeDef, b: ElementSizeDef): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

function parsePresets(value: unknown, label: string, geometry: string): SizePreset[] {
  if (!Array.isArray(value)) {
    if (geometry === 'LINEAR') {
      return [];
    }
    throw new Error(`element-types: ${label}.sizePresets must be an array`);
  }
  return value.map((entry, index) => {
    const record = asRecord(entry, `${label}.sizePresets[${index}]`);
    if (typeof record.label !== 'string' || typeof record.source !== 'string') {
      throw new Error(`element-types: ${label}.sizePresets[${index}] needs label and source`);
    }
    return {
      label: record.label,
      size: toSize(record.size, `${label}.sizePresets[${index}].size`),
      source: record.source,
    };
  });
}

function parseParamSpec(value: unknown, label: string): ParamSpec[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`element-types: ${label}.paramSpec must be an array`);
  }
  return value.map((entry, index) => {
    const record = asRecord(entry, `${label}.paramSpec[${index}]`);
    if (typeof record.name !== 'string') {
      throw new Error(`element-types: ${label}.paramSpec[${index}].name is required`);
    }
    if (record.type !== 'number' && record.type !== 'enum') {
      throw new Error(`element-types: ${label}.paramSpec[${index}].type must be number or enum`);
    }
    const spec: ParamSpec = {
      name: record.name,
      type: record.type,
      default: record.default as number | string,
    };
    if (record.values !== undefined) {
      if (!Array.isArray(record.values) || !record.values.every((item) => typeof item === 'string')) {
        throw new Error(`element-types: ${label}.paramSpec[${index}].values must be strings`);
      }
      spec.values = record.values as string[];
    }
    if (spec.type === 'enum' && spec.values === undefined) {
      throw new Error(`element-types: ${label}.paramSpec[${index}] enum needs values`);
    }
    if (typeof record.unit === 'string') {
      spec.unit = record.unit;
    }
    return spec;
  });
}

function parseStringArray(value: unknown, label: string): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`element-types: ${label} must be an array of strings`);
  }
  return value as string[];
}

function parseAliases(value: unknown, code: string): string[] {
  const aliases = parseStringArray(value, `${code}.aliases`);
  for (const alias of aliases) {
    if (!ALIAS_PATTERN.test(alias)) {
      throw new Error(`element-types: ${code} alias "${alias}" must be lower-case with no punctuation`);
    }
  }
  return aliases;
}

function parseLinear(value: unknown, code: string, geometry: string): LinearSpec | null {
  if (geometry !== 'LINEAR') {
    if (value !== undefined) {
      throw new Error(`element-types: ${code}.linear is only allowed for LINEAR types`);
    }
    return null;
  }
  const record = asRecord(value, `${code}.linear`);
  const unit = record.unit;
  if (unit !== 'RFT' && unit !== 'RM') {
    throw new Error(`element-types: ${code}.linear.unit must be RFT or RM`);
  }
  return {
    segmentLength: toAxis(record.segmentLength, `${code}.linear.segmentLength`),
    defaultWidth: toAxis(record.defaultWidth, `${code}.linear.defaultWidth`),
    unit,
  };
}

function parseOfferingMappings(value: unknown, code: string): OfferingMapping[] {
  if (!Array.isArray(value)) {
    throw new Error(`element-types: ${code}.offeringMappings must be an array`);
  }
  return value.map((entry, index) => {
    const record = asRecord(entry, `${code}.offeringMappings[${index}]`);
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
  const record = asRecord(value, `types[${index}]`);
  if (typeof record.code !== 'string' || record.code.length === 0) {
    throw new Error(`element-types: types[${index}].code is required`);
  }
  const code = record.code;
  if (record.geometry !== 'BOX' && record.geometry !== 'FLAT' && record.geometry !== 'LINEAR') {
    throw new Error(`element-types: ${code}.geometry must be BOX, FLAT or LINEAR`);
  }
  const geometry = record.geometry;

  const linear = parseLinear(record.linear, code, geometry);

  let defaultSize = ZERO_SIZE;
  let minSize = ZERO_SIZE;
  let maxSize = ZERO_SIZE;
  if (geometry === 'LINEAR') {
    for (const axis of ['defaultSize', 'minSize', 'maxSize'] as const) {
      if (record[axis] !== undefined) {
        throw new Error(`element-types: LINEAR type ${code} must not carry ${axis}`);
      }
    }
  } else {
    defaultSize = toSize(record.defaultSize, `${code}.defaultSize`);
    minSize = toSize(record.minSize, `${code}.minSize`);
    maxSize = toSize(record.maxSize, `${code}.maxSize`);
    for (const axis of AXES) {
      if (!(minSize[axis] <= defaultSize[axis] && defaultSize[axis] <= maxSize[axis])) {
        throw new Error(`element-types: ${code}.${axis} must satisfy min <= default <= max`);
      }
    }
    if (geometry === 'FLAT' && (defaultSize.z !== 0 || minSize.z !== 0 || maxSize.z !== 0)) {
      throw new Error(`element-types: FLAT type ${code} must have z = 0`);
    }
  }

  const sizePresets = parsePresets(record.sizePresets, code, geometry);
  if (geometry !== 'LINEAR') {
    if (sizePresets.length === 0) {
      throw new Error(`element-types: ${code}.sizePresets must not be empty`);
    }
    if (!sizePresets.some((preset) => sameSize(preset.size, defaultSize))) {
      throw new Error(`element-types: ${code}.defaultSize must equal one sizePreset`);
    }
  }

  if (typeof record.name !== 'string' || typeof record.category !== 'string') {
    throw new Error(`element-types: ${code}.name and .category are required`);
  }
  if (typeof record.defaultCount !== 'number' || !Number.isSafeInteger(record.defaultCount)) {
    throw new Error(`element-types: ${code}.defaultCount must be an integer`);
  }
  if (typeof record.color !== 'string' || typeof record.source !== 'string') {
    throw new Error(`element-types: ${code}.color and .source are required`);
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
    aliases: parseAliases(record.aliases, code),
    sizePresets,
    paramSpec: parseParamSpec(record.paramSpec, code),
    regionTags: parseStringArray(record.regionTags, `${code}.regionTags`),
    eventTypeTags: parseStringArray(record.eventTypeTags, `${code}.eventTypeTags`),
    linear,
    offeringMappings: parseOfferingMappings(record.offeringMappings, code),
  };
}

export function loadElementTypeRegistry(raw: unknown = rawRegistry): ElementTypeRegistry {
  const types = (raw as { types?: unknown }).types;
  if (!Array.isArray(types)) {
    throw new Error('element-types: expected a top-level "types" array');
  }
  const registry = new Map<string, ElementTypeDef>();
  const aliasOwner = new Map<string, string>();
  for (const [index, entry] of types.entries()) {
    const definition = parseType(entry, index);
    if (registry.has(definition.code)) {
      throw new Error(`element-types: duplicate code "${definition.code}"`);
    }
    for (const alias of definition.aliases) {
      const owner = aliasOwner.get(alias);
      if (owner !== undefined) {
        throw new Error(`element-types: alias "${alias}" is used by both ${owner} and ${definition.code}`);
      }
      aliasOwner.set(alias, definition.code);
    }
    registry.set(definition.code, definition);
  }
  return registry;
}

/** The seeded registry. */
export const elementTypeRegistry: ElementTypeRegistry = loadElementTypeRegistry();
