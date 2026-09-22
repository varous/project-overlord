/**
 * Demo site definition. PURE module: it must not import Cesium.
 *
 * The site origin is the downstage-centre edge of the main stage. +Y points toward the audience,
 * +Z up, +X stage right. All lengths are integer tmm built from FEET strings.
 */

import { toTmm, type LocalPoint, type Provenance, type SiteAnchor, type Tmm } from '@overlord/geo-core';

export interface ElementSize {
  x: Tmm;
  y: Tmm;
  z: Tmm;
}

export type ElementType = 'stage' | 'riser' | 'green_room' | 'audience_zone';

export interface SiteElement {
  id: string;
  type: ElementType;
  label: string;
  /** Centre of the element in local site coordinates (tmm). */
  center: LocalPoint;
  /** Axis-aligned size before rotation (tmm). `z = 0` marks a flat ground zone. */
  size: ElementSize;
  /** Rotation about +Z in degrees, clockwise positive, relative to site +Y. */
  rotationDeg: number;
  provenance: Provenance;
}

/** Exact feet to tmm; coordinates may be negative. */
const ft = (value: string): Tmm => toTmm(value, 'ft', { allowNegative: true });

/**
 * Read off Esri imagery in Task 002 — open Maidan ground, still approximate.
 * Brigade Parade Ground area, Kolkata. Height is ellipsoidal metres.
 */
export const DEMO_ANCHOR: SiteAnchor = {
  latDeg: 22.5579,
  lonDeg: 88.3439,
  heightM: 0,
  headingDeg: 0,
};

export const DEMO_ELEMENTS: SiteElement[] = [
  {
    id: 'main_stage',
    type: 'stage',
    label: 'Main stage',
    // x: -30..+30 ft, y: -40..0 ft, z: 0..6 ft.
    center: { x: ft('0'), y: ft('-20'), z: ft('3') },
    size: { x: ft('60'), y: ft('40'), z: ft('6') },
    rotationDeg: 0,
    provenance: 'ARCHETYPE',
  },
  {
    id: 'foh_console',
    type: 'riser',
    label: 'FOH console',
    center: { x: ft('0'), y: ft('120'), z: ft('1') },
    size: { x: ft('20'), y: ft('16'), z: ft('2') },
    rotationDeg: 0,
    provenance: 'ARCHETYPE',
  },
  {
    id: 'green_room_1',
    type: 'green_room',
    label: 'GR1',
    center: { x: ft('-36'), y: ft('-70'), z: ft('5') },
    size: { x: ft('16'), y: ft('16'), z: ft('10') },
    rotationDeg: 0,
    provenance: 'ARCHETYPE',
  },
  {
    id: 'green_room_2',
    type: 'green_room',
    label: 'GR2',
    center: { x: ft('-12'), y: ft('-70'), z: ft('5') },
    size: { x: ft('16'), y: ft('16'), z: ft('10') },
    rotationDeg: 0,
    provenance: 'ARCHETYPE',
  },
  {
    id: 'green_room_3',
    type: 'green_room',
    label: 'GR3',
    center: { x: ft('12'), y: ft('-70'), z: ft('5') },
    size: { x: ft('16'), y: ft('16'), z: ft('10') },
    rotationDeg: 0,
    provenance: 'ARCHETYPE',
  },
  {
    id: 'green_room_4',
    type: 'green_room',
    label: 'GR4',
    center: { x: ft('36'), y: ft('-70'), z: ft('5') },
    size: { x: ft('16'), y: ft('16'), z: ft('10') },
    rotationDeg: 0,
    provenance: 'ARCHETYPE',
  },
  {
    id: 'audience_zone',
    type: 'audience_zone',
    label: 'Audience zone',
    // Flat 200 x 250 ft, x: -100..+100 ft, y: +10..+260 ft.
    center: { x: ft('0'), y: ft('135'), z: ft('0') },
    size: { x: ft('200'), y: ft('250'), z: ft('0') },
    rotationDeg: 0,
    provenance: 'ARCHETYPE',
  },
];
