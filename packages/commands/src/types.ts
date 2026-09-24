/**
 * The typed edit-command union. Every scene change in the product is expressed as one of these and
 * applied through `applyCommand`, which validates the result and returns its exact inverse.
 *
 * All lengths are integer tmm; all angles are degrees. Optional `provenance`/`note` fields exist on
 * the zone and site commands so that their inverses can restore the previous value exactly.
 */

import type { LocalPoint, Provenance, SiteAnchor, Tmm } from '@overlord/geo-core';
import type { ElementSize, Ring2, SceneElement, SceneZone, ZoneKind } from '@overlord/scene';

export interface AddElementCommand {
  type: 'ADD_ELEMENT';
  typeCode: string;
  id?: string;
  label?: string;
  center: LocalPoint;
  rotationDeg?: number;
  size?: ElementSize;
  provenance: Provenance;
  /** Size provenance when it differs from the placement provenance (used by DELETE_ELEMENT's inverse). */
  sizeProvenance?: Provenance;
  /** Insertion index; used by DELETE_ELEMENT's inverse to restore the original order. */
  index?: number;
}

export interface MoveElementAbsoluteCommand {
  type: 'MOVE_ELEMENT_ABSOLUTE';
  id: string;
  center: LocalPoint;
  /** Previous provenance/note, so the inverse can restore the field exactly. */
  provenance?: Provenance;
  note?: string;
}

export interface MoveElementRelativeCommand {
  type: 'MOVE_ELEMENT_RELATIVE';
  id: string;
  delta: { x: Tmm; y: Tmm; z?: Tmm };
  provenance?: Provenance;
  note?: string;
}

export interface RotateElementCommand {
  type: 'ROTATE_ELEMENT';
  id: string;
  /** Absolute rotation in degrees, normalised to [0, 360). */
  rotationDeg: number;
  provenance?: Provenance;
  note?: string;
}

export interface ResizeElementCommand {
  type: 'RESIZE_ELEMENT';
  id: string;
  size: ElementSize;
  provenance?: Provenance;
  note?: string;
}

export interface DeleteElementCommand {
  type: 'DELETE_ELEMENT';
  id: string;
}

export interface SetElementLabelCommand {
  type: 'SET_ELEMENT_LABEL';
  id: string;
  label: string;
}

export interface AddZoneCommand {
  type: 'ADD_ZONE';
  kind: ZoneKind;
  label: string;
  ring: Ring2;
  id?: string;
  provenance?: Provenance;
  note?: string;
  /** Insertion index; used by DELETE_ZONE's inverse to restore the original order. */
  index?: number;
}

export interface SetZoneRingCommand {
  type: 'SET_ZONE_RING';
  id: string;
  ring: Ring2;
  provenance?: Provenance;
  note?: string;
}

export interface DeleteZoneCommand {
  type: 'DELETE_ZONE';
  id: string;
}

export interface SetSiteAnchorCommand {
  type: 'SET_SITE_ANCHOR';
  anchor: SiteAnchor;
  provenance?: Provenance;
  note?: string;
}

export interface SetSceneNameCommand {
  type: 'SET_SCENE_NAME';
  name: string;
}

/** Replace the whole element and zone lists (used for one-step layout generation). */
export interface ReplaceContentCommand {
  type: 'REPLACE_CONTENT';
  elements: SceneElement[];
  zones: SceneZone[];
}

export type Command =
  | AddElementCommand
  | MoveElementAbsoluteCommand
  | MoveElementRelativeCommand
  | RotateElementCommand
  | ResizeElementCommand
  | DeleteElementCommand
  | SetElementLabelCommand
  | AddZoneCommand
  | SetZoneRingCommand
  | DeleteZoneCommand
  | SetSiteAnchorCommand
  | SetSceneNameCommand
  | ReplaceContentCommand;

export type CommandErrorCode =
  | 'ELEMENT_NOT_FOUND'
  | 'ZONE_NOT_FOUND'
  | 'UNKNOWN_TYPE'
  | 'SIZE_OUT_OF_BOUNDS'
  | 'RING_INVALID'
  | 'WOULD_INVALIDATE'
  | 'DUPLICATE_ID';

export interface CommandError {
  code: CommandErrorCode;
  message: string;
  details?: unknown;
}
