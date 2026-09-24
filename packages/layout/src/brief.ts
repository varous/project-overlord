/**
 * Brief normalisation. Every field the user did not state gets an assumption with a plain-English
 * reason; provenance is STATED for what the user said, INFERRED for derived counts, ARCHETYPE for
 * template defaults.
 */

import { toTmm, type LengthUnit, type Sourced } from '@overlord/geo-core';
import type { ElementSize, Ring2 } from '@overlord/scene';

import { loadArchetypes } from './archetypes.js';
import {
  AUDIENCE_DENSITY_DEFAULT,
  findSizingRule,
  sizingCount,
  sizingReason,
} from './sizing.js';
import type { Assumption, BriefInput, EventBrief, EventType } from './types.js';

const DEFAULT_CAPACITY = 1000;
const CORPUS_GREEN_ROOMS = 4;
const GREEN_ROOM_REASON =
  'assumed 4 green rooms — your drawings specify 16x16 ft x 4 in 27 of 27 cases';

function stated<T>(value: T): Sourced<T> {
  return { value, provenance: 'STATED' };
}

function assumed<T>(value: T, provenance: 'INFERRED' | 'ARCHETYPE'): Sourced<T> {
  return { value, provenance };
}

export function normaliseBrief(partial: BriefInput): { brief: EventBrief; assumptions: Assumption[] } {
  const assumptions: Assumption[] = [];
  const archetypes = loadArchetypes();

  let eventType: EventType;
  if (partial.eventType !== undefined) {
    eventType = partial.eventType;
  } else {
    eventType = 'CONCERT';
    assumptions.push({
      field: 'eventType',
      value: 'CONCERT',
      reason: 'assumed a concert — no event type was given',
      provenance: 'ARCHETYPE',
    });
  }

  const archetype = archetypes.get(eventType);
  if (archetype === undefined) {
    throw new Error(`No archetype for event type ${eventType}`);
  }

  let capacity: number;
  if (partial.capacity !== undefined) {
    capacity = partial.capacity;
  } else {
    capacity = DEFAULT_CAPACITY;
    assumptions.push({
      field: 'capacity',
      value: DEFAULT_CAPACITY,
      reason: 'assumed 1,000 people — no capacity was given',
      provenance: 'ARCHETYPE',
    });
  }

  let density: number;
  if (partial.standingDensityPerM2 !== undefined) {
    density = partial.standingDensityPerM2;
  } else {
    density = AUDIENCE_DENSITY_DEFAULT;
    assumptions.push({
      field: 'standingDensityPerM2',
      value: density,
      reason: `assumed ${density} people/m² — CAV planning default, not a compliance figure`,
      provenance: 'ARCHETYPE',
    });
  }

  let stageSize: Sourced<ElementSize>;
  if (partial.stageSize !== undefined) {
    stageSize = stated(partial.stageSize);
  } else {
    const size: ElementSize = {
      x: toTmm(archetype.stageDefault.x[0], archetype.stageDefault.x[1] as LengthUnit),
      y: toTmm(archetype.stageDefault.y[0], archetype.stageDefault.y[1] as LengthUnit),
      z: toTmm(archetype.stageDefault.z[0], archetype.stageDefault.z[1] as LengthUnit),
    };
    stageSize = assumed(size, 'ARCHETYPE');
    assumptions.push({
      field: 'stageSize',
      value: size,
      reason: `assumed a ${archetype.stageDefault.x[0]}x${archetype.stageDefault.y[0]}x${archetype.stageDefault.z[0]} ft stage — the ${archetype.name} archetype default`,
      provenance: 'ARCHETYPE',
    });
  }

  let days: Sourced<number>;
  if (partial.days !== undefined) {
    days = stated(partial.days);
  } else {
    days = assumed(1, 'ARCHETYPE');
    assumptions.push({
      field: 'days',
      value: 1,
      reason: 'assumed a single-day event — no duration was given',
      provenance: 'ARCHETYPE',
    });
  }

  const counts: Partial<Record<keyof EventBrief, Sourced<number> | null>> = {};
  for (const rule of sizingRuleFields) {
    const provided = partial[rule.id as keyof BriefInput];
    if (typeof provided === 'number') {
      counts[rule.field] = stated(provided);
      continue;
    }
    const sizing = findSizingRule(rule.id);
    if (sizing === null) {
      continue;
    }
    const count = sizingCount(sizing, capacity);
    counts[rule.field] = assumed(count, 'INFERRED');
    assumptions.push({
      field: rule.field,
      value: count,
      reason: sizingReason(sizing, count),
      provenance: 'INFERRED',
    });
  }

  let greenRooms: Sourced<number>;
  if (partial.greenRooms !== undefined) {
    greenRooms = stated(partial.greenRooms);
  } else {
    greenRooms = assumed(CORPUS_GREEN_ROOMS, 'ARCHETYPE');
    assumptions.push({
      field: 'greenRooms',
      value: CORPUS_GREEN_ROOMS,
      reason: GREEN_ROOM_REASON,
      provenance: 'ARCHETYPE',
    });
  }

  let hasVvip: Sourced<boolean>;
  if (partial.hasVvip !== undefined) {
    hasVvip = stated(partial.hasVvip);
  } else {
    const value = eventType === 'CONCERT' || eventType === 'FESTIVAL' || eventType === 'WEDDING';
    hasVvip = assumed(value, 'ARCHETYPE');
    assumptions.push({
      field: 'hasVvip',
      value,
      reason: `assumed${value ? '' : ' no'} VVIP platform — the ${archetype.name} archetype default`,
      provenance: 'ARCHETYPE',
    });
  }

  let hasParking: Sourced<boolean>;
  if (partial.hasParking !== undefined) {
    hasParking = stated(partial.hasParking);
  } else {
    hasParking = assumed(true, 'ARCHETYPE');
    assumptions.push({
      field: 'hasParking',
      value: true,
      reason: 'assumed parking — the archetype default; set hasParking false to omit it',
      provenance: 'ARCHETYPE',
    });
  }

  let orientationPreference: Sourced<{ headingDeg: number }> | null;
  if (partial.orientationPreference !== undefined && partial.orientationPreference !== null) {
    orientationPreference = stated(partial.orientationPreference);
  } else {
    orientationPreference = null;
    assumptions.push({
      field: 'orientationPreference',
      value: null,
      reason: 'no orientation given — using the archetype default heading',
      provenance: 'ARCHETYPE',
    });
  }

  let siteBoundary: Sourced<Ring2> | null = null;
  if (partial.siteBoundary !== undefined && partial.siteBoundary !== null) {
    siteBoundary = stated(partial.siteBoundary);
  } else {
    assumptions.push({
      field: 'siteBoundary',
      value: null,
      reason: 'no boundary given — open ground assumed',
      provenance: 'ARCHETYPE',
    });
  }

  const brief: EventBrief = {
    eventType: stated(eventType),
    capacity: stated(capacity),
    standingDensityPerM2: stated(density),
    stageSize,
    days,
    foodStalls: counts['foodStalls'] ?? null,
    bars: counts['bars'] ?? null,
    toiletBlocks: counts['toiletBlocks'] ?? null,
    entryGates: counts['entryGates'] ?? null,
    friskingBooths: counts['friskingBooths'] ?? null,
    greenRooms,
    ledWalls: counts['ledWalls'] ?? null,
    generators: counts['generators'] ?? null,
    hasVvip,
    hasParking,
    orientationPreference,
    siteBoundary,
  };

  return { brief, assumptions };
}

interface SizingField {
  id: string;
  field: keyof EventBrief;
}

const sizingRuleFields: readonly SizingField[] = [
  { id: 'toiletBlocks', field: 'toiletBlocks' },
  { id: 'entryGates', field: 'entryGates' },
  { id: 'friskingBooths', field: 'friskingBooths' },
  { id: 'bars', field: 'bars' },
  { id: 'foodStalls', field: 'foodStalls' },
  { id: 'ledWalls', field: 'ledWalls' },
  { id: 'generators', field: 'generators' },
];
