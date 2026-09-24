/**
 * Sample the ground (ellipsoidal) height at the site anchor from the Google 3D tileset.
 *
 * Primary: `scene.sampleHeightMostDetailed`. Fallback: `scene.clampToHeightMostDetailed`.
 * Returns `null` when no height could be sampled, or when `timeoutMs` elapses first.
 */

import * as Cesium from 'cesium';

import { geodeticToEcef, type SiteAnchor } from '@overlord/geo-core';

export const DEFAULT_GROUND_SAMPLE_TIMEOUT_MS = 5000;

/** A ground-height sample, injectable so the timeout path can be unit-tested without Cesium. */
export type GroundSampler = () => Promise<number | null>;

/**
 * Race a sample against a timeout. Resolves with the sampled height, or `null` on timeout.
 * The timer is always cleared, so a pending timer never keeps the process alive.
 */
export async function sampleWithTimeout(
  sample: GroundSampler,
  timeoutMs: number,
): Promise<number | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      sample(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          resolve(null);
        }, timeoutMs);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

async function rawSample(
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

export async function sampleGroundHeight(
  viewer: Cesium.Viewer,
  tileset: Cesium.Cesium3DTileset,
  anchor: SiteAnchor,
  timeoutMs: number = DEFAULT_GROUND_SAMPLE_TIMEOUT_MS,
): Promise<number | null> {
  return sampleWithTimeout(() => rawSample(viewer, tileset, anchor), timeoutMs);
}
