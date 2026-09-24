/**
 * Scene document model. All lengths are integer tmm; angles are degrees.
 */

import type { LocalPoint, SiteAnchor, Sourced, Tmm } from '@overlord/geo-core';

/** A closed ring of local tmm coordinates (first point not repeated). */
export type Ring2 = { x: Tmm; y: Tmm }[];

export interface SceneImagery {
  provider: 'ESRI' | 'OSM' | 'GOOGLE_3D';
  captureDate: string | null;
}

export interface SceneSite {
  /** OPEN_GROUND for now; INDOOR_FLOOR is reserved for later. */
  kind: SiteKind;
  /** Indoor level; 0 outdoors. Reserved so retrofitting it later is not expensive. */
  level: number;
  anchor: Sourced<SiteAnchor>;
  /** CCW simple ring in local tmm, or null. */
  boundary: Sourced<Ring2> | null;
  imagery: SceneImagery;
}

export type SiteKind = 'OPEN_GROUND' | 'INDOOR_FLOOR';

export interface ElementPlacement {
  center: LocalPoint;
  rotationDeg: number;
}

export interface ElementSize {
  x: Tmm;
  y: Tmm;
  z: Tmm;
}

export interface SceneElement {
  id: string;
  /** Must exist in the element-type registry. */
  typeCode: string;
  label: string;
  placement: Sourced<ElementPlacement>;
  size: Sourced<ElementSize>;
  params: Record<string, Sourced<number | string>>;
}

export type ZoneKind =
  | 'AUDIENCE'
  | 'BACKSTAGE'
  | 'FNB'
  | 'VIP'
  | 'PARKING'
  | 'CIRCULATION'
  | 'OTHER';

export const ZONE_KINDS: readonly ZoneKind[] = [
  'AUDIENCE',
  'BACKSTAGE',
  'FNB',
  'VIP',
  'PARKING',
  'CIRCULATION',
  'OTHER',
];

export interface SceneZone {
  id: string;
  kind: ZoneKind;
  label: string;
  ring: Sourced<Ring2>;
  /** Planning density in square feet per person (5 is the CAV standard). */
  densitySqFtPerPerson: Sourced<number>;
}

export type MeasurementKind = 'DISTANCE' | 'AREA';

/** A user-drawn measurement. Its value is derived from `points`. */
export interface SceneMeasurement {
  id: string;
  label: string;
  kind: MeasurementKind;
  points: LocalPoint[];
}

export interface SceneViewpoint {
  id: string;
  label: string;
  eye: LocalPoint;
  target: LocalPoint;
}

export interface SceneDoc {
  schemaVersion: 2;
  /** Stable scene id, e.g. "scn_" + 20 chars [a-z0-9]. */
  id: string;
  name: string;
  site: SceneSite;
  elements: SceneElement[];
  zones: SceneZone[];
  viewpoints: SceneViewpoint[];
  measurements: SceneMeasurement[];
}

/** An immutable scene version. */
export interface SceneVersion {
  sceneId: string;
  version: number;
  parentVersion: number | null;
  /** ISO timestamp. */
  createdAt: string;
  author: string;
  message: string;
  /** sha256 hex of canonicalJson(doc). */
  contentHash: string;
  doc: SceneDoc;
}

export const SCHEMA_VERSION = 2;
