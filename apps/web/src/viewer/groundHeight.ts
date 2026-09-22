/**
 * Sample the ground (ellipsoidal) height at the site anchor from the Google 3D tileset.
 *
 * Primary: `scene.sampleHeightMostDetailed`. Fallback: `scene.clampToHeightMostDetailed`.
 * Returns `null` when no height could be sampled.
 */

import * as Cesium from 'cesium';

import { geodeticToEcef, type SiteAnchor } from '@overlord/geo-core';

export async function sampleGroundHeight(
  viewer: Cesium.Viewer,
  tileset: Cesium.Cesium3DTileset,
  anchor: SiteAnchor,
): Promise<number | null> {
  const cartographic = Cesium.Cartographic.fromDegrees(anchor.lonDeg, anchor.latDeg);

  try {
    const sampled = await viewer.scene.sampleHeightMostDetailed([cartographic]);
    const first = sampled[0];
    if (first !== undefined && first !== null && Number.isFinite(first.height)) {
      return first.height;
    }
  } catch (error) {
    console.warn('sampleHeightMostDetailed failed; falling back to clampToHeightMostDetailed', error);
  }

  try {
    const [x, y, z] = geodeticToEcef(anchor);
    const position = new Cesium.Cartesian3(x, y, z);
    const clamped = await viewer.scene.clampToHeightMostDetailed([position], [tileset]);
    const first = clamped[0];
    if (first !== undefined && first !== null) {
      const result = Cesium.Cartographic.fromCartesian(first);
      if (result !== undefined && Number.isFinite(result.height)) {
        return result.height;
      }
    }
  } catch (error) {
    console.warn('clampToHeightMostDetailed failed', error);
  }

  return null;
}
