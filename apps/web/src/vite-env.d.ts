/// <reference types="vite/client" />

import type { LocalPoint, SiteAnchor } from '@overlord/geo-core';
import type { Command } from '@overlord/commands';
import type { SceneDoc, SceneElement, ZoneKind } from '@overlord/scene';

import type { MapStack } from './viewer/mapStacks.js';
import type { ViewpointName } from './viewer/viewpoints.js';

export interface GroundHeight {
  heightM: number;
  source: string;
}

export type TestSelection = { kind: 'element' | 'zone'; id: string } | null;

/**
 * Test hook exposed on `window.__overlord` only when the URL has `?test=1`.
 */
export interface OverlordTestHook {
  /** True once all entities are built and one frame rendered after the initial stack settled. */
  readonly ready: boolean;
  readonly entityCount: number;
  /** Current stack after any fallback. */
  readonly activeStack: MapStack;
  readonly anchor: SiteAnchor;
  readonly renderErrors: number;
  readonly tileErrors: number;
  readonly groundHeight: GroundHeight;
  /** True when viewing a shared link or a non-latest version (no editing). */
  readonly readOnly: boolean;
  /** True when an access key is stored. */
  readonly connected: boolean;
  /** The { sceneId, version } currently loaded, or null for the unsaved demo scene. */
  readonly loadedFrom: { sceneId: string; version: number } | null;
  flyTo(name: ViewpointName): Promise<void>;
  setStack(stack: MapStack): Promise<void>;
  /** Resolves true once tiles are loaded for 3 consecutive frames, or false on timeout. */
  waitForTilesLoaded(timeoutMs: number): Promise<boolean>;
  /** Programmatically apply a placement through the same code path as the UI. */
  placeSite(latDeg: number, lonDeg: number, headingDeg: number): Promise<void>;
  /** Apply an edit command through @overlord/commands (the only mutation path). */
  runCommand(command: Command): { ok: true } | { ok: false; message: string };
  undo(): boolean;
  redo(): boolean;
  selection(): TestSelection;
  docHash(): string;
  doc(): SceneDoc;
  elementCount(): number;
  element(id: string): SceneElement | null;
  /** Finish a pending palette add at a local tmm point (same path as a ground click). */
  placePending(x: number, y: number): void;
  select(kind: 'element' | 'zone', id: string): void;
  clearSelection(): void;
  /** Altitude the current scene would be fitted to at the current aspect ratio. */
  fittedAltitudeM(): number;
  /** Current camera altitude in metres. */
  cameraAltitudeM(): number;
  /** Re-run the Aerial framing for the current scene (the Fit button / F key). */
  fit(): Promise<void>;
  /** True while placement mode is active. */
  isPlacing(): boolean;
  /** True once the +Y heading handle exists. */
  hasPlacementHandle(): boolean;
  /** Screen position of the +Y heading handle, or null. */
  headingHandleScreen(): { x: number; y: number } | null;
  /** "active", "unavailable (403)" or "not active". */
  esriStatus(): string;
  /** Number of undo entries (one per issued command). */
  historyDepth(): number;
  /** True when an entity with that id exists (used to check measurements render). */
  hasEntity(id: string): boolean;
  /** Draw a rectangle zone through the same path as the mouse tool. Returns the zone id. */
  addRectangleZone(
    centre: LocalPoint,
    sizeX: number,
    sizeY: number,
    kind: ZoneKind,
    label: string,
  ): string | null;
  /** Validate and draw a polygon zone (refused when self-intersecting). */
  drawPolygon(
    points: Array<{ x: number; y: number }>,
    kind: ZoneKind,
    label: string,
  ): { ok: boolean; message?: string };
  /** Move one zone vertex, issuing a single SET_ZONE_RING. */
  moveZoneVertex(zoneId: string, index: number, x: number, y: number): boolean;
  /** Add a measurement (AREA when 3+ points, otherwise DISTANCE). Returns its id. */
  addMeasurement(kind: 'DISTANCE' | 'AREA', points: LocalPoint[], label: string): string | null;
  isDrawing(): boolean;
  drawMode(): 'rectangle' | 'polygon' | 'measure' | null;
  startDraw(mode: 'rectangle' | 'polygon' | 'measure'): void;
  finishDraw(): void;
}

declare global {
  interface ImportMetaEnv {
    readonly VITE_GOOGLE_MAPS_KEY?: string;
    readonly VITE_ARCGIS_API_KEY?: string;
    readonly VITE_COMMIT_SHA?: string;
    readonly VITE_BRANCH?: string;
    readonly VITE_API_BASE_URL?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  interface Window {
    __overlord?: OverlordTestHook;
  }
}
