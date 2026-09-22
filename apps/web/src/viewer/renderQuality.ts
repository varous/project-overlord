/**
 * Render quality policy.
 *
 * Test mode (`?test=1`) uses bounded tile quality so the browser smoke tests can reach
 * `tilesLoaded` on software-rendered CI runners. Normal use keeps Cesium/service defaults.
 */

export interface RenderQuality {
  /** Esri imagery maximum level; null = use the service metadata (full LOD). */
  maximumLevel: number | null;
  /** Globe screen-space error; null = Cesium default (2). */
  globeMaximumScreenSpaceError: number | null;
}

export function renderQualityFor(testMode: boolean): RenderQuality {
  return testMode
    ? { maximumLevel: 17, globeMaximumScreenSpaceError: 4 }
    : { maximumLevel: null, globeMaximumScreenSpaceError: null };
}
