/// <reference types="vite/client" />

import type { SiteAnchor } from '@overlord/geo-core';
import type { Command } from '@overlord/commands';
import type { SceneDoc, SceneElement } from '@overlord/scene';

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
