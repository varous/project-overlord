/**
 * Small Cesium helper for site placement: ground picking, ENU conversion and the heading handle.
 */

import * as Cesium from 'cesium';

import { geodeticToLocal, localToGeodetic, type SiteAnchor, type Tmm } from '@overlord/geo-core';

const TMM_PER_M = 10000;
const HANDLE_ELEVATION_M = 3;

export interface GroundPoint {
  latDeg: number;
  lonDeg: number;
  heightM: number;
}

export interface EnuPoint {
  east: number;
  north: number;
}

/** Pick the ground under a screen position; depth picking first when a 3D tileset is active. */
export function pickGroundGeodetic(
  viewer: Cesium.Viewer,
  screen: Cesium.Cartesian2,
  preferDepth: boolean,
): GroundPoint | null {
  let cartesian: Cesium.Cartesian3 | undefined;
  if (preferDepth) {
    cartesian = viewer.scene.pickPosition(screen);
  }
  if (cartesian === undefined) {
    cartesian = viewer.camera.pickEllipsoid(screen, viewer.scene.globe.ellipsoid);
  }
  if (cartesian === undefined) {
    return null;
  }
  const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
  if (cartographic === undefined) {
    return null;
  }
  return {
    latDeg: Cesium.Math.toDegrees(cartographic.latitude),
    lonDeg: Cesium.Math.toDegrees(cartographic.longitude),
    heightM: cartographic.height,
  };
}

/** East/north offset of a ground point relative to the anchor, in metres. */
export function enuFromAnchor(anchor: SiteAnchor, point: GroundPoint): EnuPoint {
  const local = geodeticToLocal({ ...anchor, headingDeg: 0 }, point);
  return {
    east: (local.x as number) / TMM_PER_M,
    north: (local.y as number) / TMM_PER_M,
  };
}

/** World position of the draggable +Y heading handle, `distanceM` along the audience direction. */
export function headingHandleCartesian(anchor: SiteAnchor, distanceM = 30): Cesium.Cartesian3 {
  const local = {
    x: 0 as Tmm,
    y: Math.round(distanceM * TMM_PER_M) as Tmm,
    z: Math.round(HANDLE_ELEVATION_M * TMM_PER_M) as Tmm,
  };
  const geodetic = localToGeodetic(anchor, local);
  return Cesium.Cartesian3.fromDegrees(geodetic.lonDeg, geodetic.latDeg, geodetic.heightM);
}
