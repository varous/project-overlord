/// <reference types="vite/client" />

import type { SiteAnchor } from '@overlord/geo-core';

import type { MapStack } from './viewer/mapStacks.js';
import type { ViewpointName } from './viewer/viewpoints.js';

export interface GroundHeight {
  heightM: number;
  source: string;
}

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
  flyTo(name: ViewpointName): Promise<void>;
  setStack(stack: MapStack): Promise<void>;
  /** Resolves true once tiles are loaded for 3 consecutive frames, or false on timeout. */
  waitForTilesLoaded(timeoutMs: number): Promise<boolean>;
  /** Programmatically apply a placement through the same code path as the UI. */
  placeSite(latDeg: number, lonDeg: number, headingDeg: number): Promise<void>;
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
