/**
 * Camera framing. PURE module: no Cesium, no DOM. It turns a scene document into a local bounding
 * box and computes the altitude that fits it on screen.
 */

import { toTmm, type Tmm } from '@overlord/geo-core';
import { isPlacedElement, type SceneDoc } from '@overlord/scene';

import { elementCornersLocal } from '../site/placement.js';

export interface LocalBounds {
  minX: Tmm;
  maxX: Tmm;
  minY: Tmm;
  maxY: Tmm;
}

/** Empty scenes frame a 60 m square around the origin. */
const EMPTY_HALF_TMM = toTmm('30', 'm');

export const DEFAULT_FOV_DEG = 60;
export const DEFAULT_PADDING_FACTOR = 1.4;
export const MIN_ALTITUDE_M = 300;
export const MAX_ALTITUDE_M = 3000;
/** The Aerial/Fit pitch: tilted so the horizon gives context. */
export const AERIAL_PITCH_DEG = -75;

/** Axis-aligned local bounds over every element footprint corner and every zone ring point. */
export function sceneBoundsLocal(doc: SceneDoc): LocalBounds {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const include = (x: number, y: number): void => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  for (const element of doc.elements) {
    if (!isPlacedElement(element)) {
      continue;
    }
    const corners = elementCornersLocal({
      center: element.placement.value.center,
      size: element.size.value,
      rotationDeg: element.placement.value.rotationDeg,
    });
    for (const corner of corners) {
      include(corner.x as number, corner.y as number);
    }
  }

  for (const zone of doc.zones) {
    for (const point of zone.ring.value) {
      include(point.x as number, point.y as number);
    }
  }

  if (!Number.isFinite(minX)) {
    return {
      minX: (-EMPTY_HALF_TMM) as Tmm,
      maxX: EMPTY_HALF_TMM,
      minY: (-EMPTY_HALF_TMM) as Tmm,
      maxY: EMPTY_HALF_TMM,
    };
  }

  return { minX: minX as Tmm, maxX: maxX as Tmm, minY: minY as Tmm, maxY: maxY as Tmm };
}

export function boundsWidthM(bounds: LocalBounds): number {
  return (bounds.maxX - bounds.minX) / 10000;
}

export function boundsDepthM(bounds: LocalBounds): number {
  return (bounds.maxY - bounds.minY) / 10000;
}

export function boundsCentreLocal(bounds: LocalBounds): { x: Tmm; y: Tmm } {
  return {
    x: Math.round((bounds.minX + bounds.maxX) / 2) as Tmm,
    y: Math.round((bounds.minY + bounds.maxY) / 2) as Tmm,
  };
}

/**
 * Altitude (metres) that fits `bounds` on screen for a vertical field of view `fovDeg` and the
 * given aspect ratio, with a 40% margin and a 300-3000 m clamp.
 */
export function fitAltitudeM(
  bounds: LocalBounds,
  aspectRatio: number,
  fovDeg: number = DEFAULT_FOV_DEG,
  paddingFactor: number = DEFAULT_PADDING_FACTOR,
): number {
  const halfDepth = (boundsDepthM(bounds) / 2) * paddingFactor;
  const halfWidth = (boundsWidthM(bounds) / 2) * paddingFactor;
  const tanVertical = Math.tan((fovDeg * Math.PI) / 360);
  const tanHorizontal = tanVertical * Math.max(aspectRatio, 0.0001);
  const altitude = Math.max(halfDepth / tanVertical, halfWidth / tanHorizontal);
  return Math.min(MAX_ALTITUDE_M, Math.max(MIN_ALTITUDE_M, altitude));
}
