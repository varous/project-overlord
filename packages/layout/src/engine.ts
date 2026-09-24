/**
 * The deterministic layout engine.
 *
 * No randomness, no wall clock, no generated uuids anywhere: the same brief always produces a
 * byte-identical scene. Ids are derived from the type code and index. The pipeline is: resolve the
 * brief → compute the audience rectangle and stage size → walk the archetype rules → repair
 * (overlap + boundary) → emit zones → validate.
 */

import { sourced, toTmm, type LengthUnit, type SiteAnchor, type Tmm } from '@overlord/geo-core';
import {
  validateScene,
  type ElementSize,
  type ElementTypeRegistry,
  type Issue,
  type Ring2,
  type SceneDoc,
  type SceneElement,
  type SceneZone,
} from '@overlord/scene';

import { findArchetypeById, loadArchetypes } from './archetypes.js';
import { normaliseBrief } from './brief.js';
import { audienceAreaM2 } from './sizing.js';
import type {
  Assumption,
  AudienceRect,
  BriefInput,
  CapacitySummary,
  EventBrief,
  PlacementRule,
} from './types.js';

const FT: Tmm = 3048 as Tmm;
const CLEARANCE_HALF: Tmm = (3 * 3048) as Tmm; // half of the 6 ft clearance
const MAX_REPAIR_ITERATIONS = 20;
const MAX_PUSH_STEPS = 4000;

export interface GenerateLayoutInput {
  brief: BriefInput;
  registry: ElementTypeRegistry;
  archetypeId?: string;
  siteAnchor: SiteAnchor;
}

export interface LayoutPayload {
  assumptions: Assumption[];
  notes: string[];
  capacity: CapacitySummary;
}

export type GenerateLayoutResult =
  | ({ ok: true; scene: SceneDoc } & LayoutPayload)
  | ({ ok: false; issues: Issue[] } & LayoutPayload);

interface Footprint {
  centerX: Tmm;
  centerY: Tmm;
  sizeX: Tmm;
  sizeY: Tmm;
}

interface Placed {
  element: SceneElement;
  footprint: Footprint;
  axis: 'x' | 'y';
  typeCode: string;
  label: string;
}

function pairTmm(pair: [string, string]): Tmm {
  return toTmm(pair[0], pair[1] as LengthUnit, { allowNegative: true });
}

function anchorBase(
  anchorTo: PlacementRule['anchorTo'],
  stageSize: ElementSize,
  rect: AudienceRect,
): { x: Tmm; y: Tmm } {
  switch (anchorTo) {
    case 'STAGE_LINE':
      return { x: 0 as Tmm, y: 0 as Tmm };
    case 'STAGE_BACK':
      return { x: 0 as Tmm, y: (-stageSize.y) as Tmm };
    case 'AUDIENCE_AXIS':
      return { x: 0 as Tmm, y: 0 as Tmm };
    case 'AUDIENCE_FLANK_LEFT':
      return { x: rect.x0, y: rect.y0 };
    case 'AUDIENCE_FLANK_RIGHT':
      return { x: rect.x1, y: rect.y0 };
    case 'GATE_LINE':
      return { x: 0 as Tmm, y: rect.y1 };
    case 'PERIMETER':
      return { x: 0 as Tmm, y: (rect.y1 + 80 * (FT as number)) as Tmm };
  }
}

/** The repair push axis. All current anchors resolve to the audience (+Y) axis. */
function axisFor(): 'x' | 'y' {
  return 'y';
}

function conditionMet(rule: PlacementRule, brief: EventBrief): boolean {
  if (rule.condition === undefined) {
    return true;
  }
  const field = (brief as unknown as Record<string, unknown>)[rule.condition];
  if (field === null || field === undefined) {
    return false;
  }
  return (field as { value?: unknown }).value === true;
}

function resolveCount(rule: PlacementRule, brief: EventBrief): number {
  const count = rule.count;
  if ('fixed' in count) {
    return count.fixed;
  }
  if ('perPeople' in count) {
    return Math.max(count.min ?? 1, Math.ceil(brief.capacity.value / count.perPeople));
  }
  const field = count.from.replace('brief.', '');
  const sourcedField = (brief as unknown as Record<string, unknown>)[field];
  if (sourcedField === null || sourcedField === undefined) {
    return 0;
  }
  const value = (sourcedField as { value?: unknown }).value;
  return typeof value === 'number' ? value : 0;
}

function rulePositions(
  rule: PlacementRule,
  count: number,
  base: { x: Tmm; y: Tmm },
  spacing: Tmm,
): { x: Tmm; y: Tmm }[] {
  const ox = pairTmm(rule.offset.alongX);
  const oy = pairTmm(rule.offset.alongY);
  const startX = (base.x + ox) as Tmm;
  const startY = (base.y + oy) as Tmm;
  const positions: { x: Tmm; y: Tmm }[] = [];
  if (rule.arrangement === 'GRID') {
    const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
    for (let index = 0; index < count; index += 1) {
      positions.push({
        x: (startX + (index % cols) * (spacing as number)) as Tmm,
        y: (startY + Math.floor(index / cols) * (spacing as number)) as Tmm,
      });
    }
  } else if (rule.arrangement === 'ROW_X') {
    for (let index = 0; index < count; index += 1) {
      positions.push({ x: (startX + index * (spacing as number)) as Tmm, y: startY });
    }
  } else {
    for (let index = 0; index < count; index += 1) {
      positions.push({ x: startX, y: (startY + index * (spacing as number)) as Tmm });
    }
  }
  return positions;
}

function footprintOf(element: SceneElement): Footprint {
  return {
    centerX: element.placement.value.center.x,
    centerY: element.placement.value.center.y,
    sizeX: element.size.value.x,
    sizeY: element.size.value.y,
  };
}

function corners(fp: Footprint): { x: number; y: number }[] {
  const halfX = (fp.sizeX as number) / 2;
  const halfY = (fp.sizeY as number) / 2;
  return [
    { x: fp.centerX - halfX, y: fp.centerY - halfY },
    { x: fp.centerX + halfX, y: fp.centerY - halfY },
    { x: fp.centerX + halfX, y: fp.centerY + halfY },
    { x: fp.centerX - halfX, y: fp.centerY + halfY },
  ];
}

function overlaps(a: Footprint, b: Footprint): boolean {
  const ax0 = a.centerX - a.sizeX / 2 - CLEARANCE_HALF;
  const ax1 = a.centerX + a.sizeX / 2 + CLEARANCE_HALF;
  const ay0 = a.centerY - a.sizeY / 2 - CLEARANCE_HALF;
  const ay1 = a.centerY + a.sizeY / 2 + CLEARANCE_HALF;
  const bx0 = b.centerX - b.sizeX / 2 - CLEARANCE_HALF;
  const bx1 = b.centerX + b.sizeX / 2 + CLEARANCE_HALF;
  const by0 = b.centerY - b.sizeY / 2 - CLEARANCE_HALF;
  const by1 = b.centerY + b.sizeY / 2 + CLEARANCE_HALF;
  return ax0 < bx1 && ax1 > bx0 && ay0 < by1 && ay1 > by0;
}

function pointInRing(x: number, y: number, ring: Ring2): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const current = ring[i];
    const previous = ring[j];
    if (current === undefined || previous === undefined) {
      continue;
    }
    const xi = current.x as number;
    const yi = current.y as number;
    const xj = previous.x as number;
    const yj = previous.y as number;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

function footprintInside(fp: Footprint, ring: Ring2): boolean {
  return corners(fp).every((corner) => pointInRing(corner.x, corner.y, ring));
}

function clampInside(fp: Footprint, ring: Ring2): Footprint | null {
  if (footprintInside(fp, ring)) {
    return fp;
  }
  const xs = ring.map((point) => point.x as number);
  const ys = ring.map((point) => point.y as number);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  if (maxX - minX < fp.sizeX || maxY - minY < fp.sizeY) {
    return null;
  }
  const halfX = fp.sizeX / 2;
  const halfY = fp.sizeY / 2;
  const clamped: Footprint = {
    ...fp,
    centerX: Math.min(Math.max(fp.centerX, minX + halfX), maxX - halfX) as Tmm,
    centerY: Math.min(Math.max(fp.centerY, minY + halfY), maxY - halfY) as Tmm,
  };
  return footprintInside(clamped, ring) ? clamped : null;
}

function shift(fp: Footprint, axis: 'x' | 'y', delta: number): Footprint {
  return axis === 'x'
    ? { ...fp, centerX: (fp.centerX + delta) as Tmm }
    : { ...fp, centerY: (fp.centerY + delta) as Tmm };
}

function repair(placed: Placed[], boundary: Ring2 | null): { kept: Placed[]; dropped: Map<string, { count: number; label: string }> } {
  const dropped = new Map<string, { count: number; label: string }>();
  let working = placed.map((item) => ({ ...item, footprint: { ...item.footprint } }));

  for (let iteration = 0; iteration < MAX_REPAIR_ITERATIONS; iteration += 1) {
    let moved = false;
    for (let index = 0; index < working.length; index += 1) {
      const item = working[index];
      if (item === undefined) {
        continue;
      }

      // Pull the element inward when a boundary is given; drop it when it cannot fit at all.
      if (boundary !== null) {
        const clamped = clampInside(item.footprint, boundary);
        if (clamped === null) {
          const existing = dropped.get(item.typeCode);
          dropped.set(item.typeCode, { count: (existing?.count ?? 0) + 1, label: item.label });
          working = working.filter((candidate) => candidate !== item);
          index -= 1;
          continue;
        }
        if (clamped !== item.footprint) {
          item.footprint = clamped;
          item.element = {
            ...item.element,
            placement: sourced(
              { center: { ...item.element.placement.value.center, x: clamped.centerX, y: clamped.centerY }, rotationDeg: item.element.placement.value.rotationDeg },
              item.element.placement.provenance,
            ),
          };
          moved = true;
        }
      }

      let resolved = true;
      for (let other = 0; other < index; other += 1) {
        const earlier = working[other];
        if (earlier !== undefined && overlaps(item.footprint, earlier.footprint)) {
          resolved = false;
          break;
        }
      }
      if (resolved) {
        continue;
      }
      moved = true;
      let settled = false;
      for (let step = 1; step <= MAX_PUSH_STEPS && !settled; step += 1) {
        for (const sign of [1, -1]) {
          const trial = shift(item.footprint, item.axis, sign * step * (FT as number));
          if (boundary !== null && !footprintInside(trial, boundary)) {
            continue;
          }
          const clear = working.every(
            (other, otherIndex) => otherIndex >= index || !overlaps(trial, other.footprint),
          );
          if (clear) {
            item.footprint = trial;
            item.element = {
              ...item.element,
              placement: sourced(
                { center: { ...item.element.placement.value.center, x: trial.centerX, y: trial.centerY }, rotationDeg: item.element.placement.value.rotationDeg },
                item.element.placement.provenance,
              ),
            };
            settled = true;
            break;
          }
        }
      }
      if (!settled) {
        const existing = dropped.get(item.typeCode);
        dropped.set(item.typeCode, {
          count: (existing?.count ?? 0) + 1,
          label: item.label,
        });
        working = working.filter((candidate) => candidate !== item);
        index -= 1;
      }
    }
    if (!moved) {
      break;
    }
  }

  const kept: Placed[] = [];
  for (const item of working) {
    if (boundary !== null && !footprintInside(item.footprint, boundary)) {
      const existing = dropped.get(item.typeCode);
      dropped.set(item.typeCode, { count: (existing?.count ?? 0) + 1, label: item.label });
      continue;
    }
    kept.push(item);
  }
  return { kept, dropped };
}

function rectangleRing(x0: Tmm, y0: Tmm, x1: Tmm, y1: Tmm): Ring2 {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

function deterministicSceneId(eventType: string, capacity: number): string {
  const base = `${eventType.toLowerCase()}${capacity}`.replace(/[^a-z0-9]/g, '');
  return `scn_${base.padEnd(20, '0').slice(0, 20)}`;
}

export function generateLayout(input: GenerateLayoutInput): GenerateLayoutResult {
  const { registry } = input;
  const { brief, assumptions } = normaliseBrief(input.brief);
  const notes: string[] = [];

  const archetype =
    input.archetypeId !== undefined
      ? findArchetypeById(input.archetypeId)
      : loadArchetypes().get(brief.eventType.value) ?? null;
  if (archetype === null) {
    throw new Error(`Unknown archetype ${input.archetypeId ?? brief.eventType.value}`);
  }

  const stageSize = brief.stageSize?.value ?? ({ x: 0, y: 0, z: 0 } as ElementSize);
  const density = brief.standingDensityPerM2.value;
  const areaM2 = audienceAreaM2(brief.capacity.value, density);
  // A 1:2 audience rectangle (half as wide as it is deep), kept exactly at the requested area.
  const width = Math.round(Math.sqrt(areaM2 / 2) * 10000);
  const depth = 2 * width;
  const emittedAreaM2 = (width * depth) / 1e8;
  const rect: AudienceRect = {
    x0: -Math.floor(width / 2) as Tmm,
    y0: (10 * (FT as number)) as Tmm,
    x1: (-Math.floor(width / 2) + width) as Tmm,
    y1: (10 * (FT as number) + depth) as Tmm,
    areaM2: emittedAreaM2,
  };

  const placements: Placed[] = [];
  const typeCounters = new Map<string, number>();

  for (const rule of archetype.rules) {
    if (!conditionMet(rule, brief)) {
      continue;
    }
    const definition = registry.get(rule.typeCode);
    if (definition === undefined) {
      notes.push(`Archetype ${archetype.id} references unknown element type ${rule.typeCode} — skipped.`);
      continue;
    }
    const count = resolveCount(rule, brief);
    if (count <= 0) {
      continue;
    }
    const spacing = pairTmm(rule.spacing);
    const base = anchorBase(rule.anchorTo, stageSize, rect);
    const positions = rulePositions(rule, count, base, spacing);
    const axis = axisFor();

    positions.forEach((position) => {
      const counter = (typeCounters.get(rule.typeCode) ?? 0) + 1;
      typeCounters.set(rule.typeCode, counter);
      const id = `gen_${rule.typeCode.toLowerCase()}_${counter}`;
      const isStage = rule.typeCode === 'MAIN_STAGE';
      const size = isStage ? stageSize : definition.defaultSize;
      const center = isStage
        ? { x: 0 as Tmm, y: (-(stageSize.y / 2)) as Tmm, z: (stageSize.z / 2) as Tmm }
        : { x: position.x, y: position.y, z: (size.z / 2) as Tmm };
      const element: SceneElement = {
        id,
        typeCode: rule.typeCode,
        label: `${definition.name} ${counter}`,
        placement: sourced({ center, rotationDeg: rule.rotationDeg }, 'INFERRED'),
        size: sourced(size, isStage ? (brief.stageSize?.provenance ?? 'ARCHETYPE') : 'ARCHETYPE'),
        params: {},
      };
      placements.push({ element, footprint: footprintOf(element), axis, typeCode: rule.typeCode, label: definition.name });
    });
  }

  const boundary = brief.siteBoundary?.value ?? null;
  const { kept, dropped } = repair(placements, boundary);

  for (const [, info] of dropped) {
    notes.push(
      boundary === null
        ? `could not place ${info.count} ${info.label.toLowerCase()} without overlapping`
        : `could not place ${info.count} ${info.label.toLowerCase()} inside the boundary`,
    );
  }

  const elements = kept.map((item) => item.element);

  const zones: SceneZone[] = [
    {
      id: 'zone_audience',
      kind: 'AUDIENCE',
      label: 'Audience',
      ring: sourced(rectangleRing(rect.x0, rect.y0, rect.x1, rect.y1), 'INFERRED'),
    },
  ];

  for (const [index, zoneRule] of archetype.zones.entries()) {
    const base = anchorBase(zoneRule.anchorTo, stageSize, rect);
    const centerX = (base.x + pairTmm(zoneRule.offset.alongX)) as Tmm;
    const centerY = (base.y + pairTmm(zoneRule.offset.alongY)) as Tmm;
    const sizeX = pairTmm(zoneRule.size.x);
    const sizeY = pairTmm(zoneRule.size.y);
    zones.push({
      id: `zone_${zoneRule.kind.toLowerCase()}_${index + 1}`,
      kind: zoneRule.kind,
      label: zoneRule.label,
      ring: sourced(
        rectangleRing(
          (centerX - sizeX / 2) as Tmm,
          (centerY - sizeY / 2) as Tmm,
          (centerX + sizeX / 2) as Tmm,
          (centerY + sizeY / 2) as Tmm,
        ),
        'ARCHETYPE',
      ),
    });
  }

  if (brief.orientationPreference !== null) {
    notes.push(
      `orientation preference ${brief.orientationPreference.value.headingDeg}° recorded — element rotations stay relative to site +Y`,
    );
  }

  const scene: SceneDoc = {
    schemaVersion: 1,
    id: deterministicSceneId(brief.eventType.value, brief.capacity.value),
    name: `${archetype.name} — ${brief.capacity.value} people`,
    site: {
      anchor: sourced(input.siteAnchor, 'STATED'),
      boundary: brief.siteBoundary === null ? null : sourced(brief.siteBoundary.value, 'STATED'),
      imagery: { provider: 'ESRI', captureDate: null },
    },
    elements,
    zones,
    viewpoints: [],
  };

  const capacity: CapacitySummary = {
    statedDensity: density,
    netStandingAreaM2: emittedAreaM2,
    impliedCapacity: emittedAreaM2 * density,
  };

  const validation = validateScene(scene, registry);
  if (!validation.ok) {
    return { ok: false, issues: validation.issues, assumptions, notes, capacity };
  }
  return { ok: true, scene, assumptions, notes, capacity };
}
