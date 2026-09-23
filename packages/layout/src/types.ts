/**
 * Layout package types. All lengths are integer tmm; all angles are degrees.
 *
 * Every brief field is `Sourced`: STATED when the user said it, INFERRED when the engine derived
 * it, ARCHETYPE when it came from a template default.
 */

import type { Sourced, Tmm } from '@overlord/geo-core';
import type { ElementSize, Ring2, ZoneKind } from '@overlord/scene';

export type EventType = 'CONCERT' | 'FESTIVAL' | 'CORPORATE' | 'WEDDING' | 'EXHIBITION';

export const EVENT_TYPES: readonly EventType[] = [
  'CONCERT',
  'FESTIVAL',
  'CORPORATE',
  'WEDDING',
  'EXHIBITION',
];

export interface EventBrief {
  eventType: Sourced<EventType>;
  capacity: Sourced<number>;
  standingDensityPerM2: Sourced<number>;
  stageSize: Sourced<ElementSize> | null;
  days: Sourced<number> | null;
  foodStalls: Sourced<number> | null;
  bars: Sourced<number> | null;
  toiletBlocks: Sourced<number> | null;
  entryGates: Sourced<number> | null;
  friskingBooths: Sourced<number> | null;
  greenRooms: Sourced<number> | null;
  ledWalls: Sourced<number> | null;
  generators: Sourced<number> | null;
  hasVvip: Sourced<boolean> | null;
  hasParking: Sourced<boolean> | null;
  orientationPreference: Sourced<{ headingDeg: number }> | null;
  siteBoundary: Sourced<Ring2> | null;
}

export interface BriefInput {
  eventType?: EventType;
  capacity?: number;
  standingDensityPerM2?: number;
  stageSize?: ElementSize;
  days?: number;
  foodStalls?: number;
  bars?: number;
  toiletBlocks?: number;
  entryGates?: number;
  friskingBooths?: number;
  greenRooms?: number;
  ledWalls?: number;
  generators?: number;
  hasVvip?: boolean;
  hasParking?: boolean;
  orientationPreference?: { headingDeg: number } | null;
  siteBoundary?: Ring2 | null;
}

export interface Assumption {
  field: string;
  value: unknown;
  reason: string;
  provenance: 'INFERRED' | 'ARCHETYPE';
}

export type AnchorTo =
  | 'STAGE_BACK'
  | 'STAGE_LINE'
  | 'AUDIENCE_AXIS'
  | 'AUDIENCE_FLANK_LEFT'
  | 'AUDIENCE_FLANK_RIGHT'
  | 'GATE_LINE'
  | 'PERIMETER';

export type Arrangement = 'ROW_X' | 'ROW_Y' | 'GRID' | 'SINGLE';

export type CountRule = { from: string } | { fixed: number } | { perPeople: number; min?: number };

/** A [decimal string, unit] pair, converted with geo-core's toTmm at load time. */
export type LengthPair = [string, string];

export interface PlacementRule {
  typeCode: string;
  count: CountRule;
  anchorTo: AnchorTo;
  offset: { alongX: LengthPair; alongY: LengthPair };
  spacing: LengthPair;
  arrangement: Arrangement;
  rotationDeg: number;
  note: string;
  /** Optional brief boolean that must be true for the rule to run (e.g. "hasVvip"). */
  condition?: string;
}

export interface ZoneRule {
  kind: ZoneKind;
  label: string;
  anchorTo: AnchorTo;
  offset: { alongX: LengthPair; alongY: LengthPair };
  size: { x: LengthPair; y: LengthPair };
  note: string;
}

export interface Archetype {
  id: string;
  name: string;
  eventType: EventType;
  stageDefault: { x: LengthPair; y: LengthPair; z: LengthPair };
  rules: PlacementRule[];
  zones: ZoneRule[];
}

export interface CapacitySummary {
  statedDensity: number;
  netStandingAreaM2: number;
  impliedCapacity: number;
}

export interface AudienceRect {
  x0: Tmm;
  y0: Tmm;
  x1: Tmm;
  y1: Tmm;
  areaM2: number;
}
