/**
 * Axis gizmo at the site origin: +X stage right (red), +Y audience (green), +Z up (blue).
 * Positions are computed from the site frame with geo-core, not hardcoded lat/lon.
 */

import * as Cesium from 'cesium';

import { geodeticToEcef, localToGeodetic, type SiteAnchor, type Tmm } from '@overlord/geo-core';

const TMM_PER_M = 10000;

function localCartesian(anchor: SiteAnchor, xM: number, yM: number, zM: number): Cesium.Cartesian3 {
  const point = {
    x: Math.round(xM * TMM_PER_M) as Tmm,
    y: Math.round(yM * TMM_PER_M) as Tmm,
    z: Math.round(zM * TMM_PER_M) as Tmm,
  };
  const [x, y, z] = geodeticToEcef(localToGeodetic(anchor, point));
  return new Cesium.Cartesian3(x, y, z);
}

function labelOptions(text: string): Cesium.LabelGraphics.ConstructorOptions {
  return {
    text,
    font: '14px sans-serif',
    fillColor: Cesium.Color.WHITE,
    outlineColor: Cesium.Color.BLACK,
    outlineWidth: 2,
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
    pixelOffset: new Cesium.Cartesian2(0, -12),
    distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 600),
    scaleByDistance: new Cesium.NearFarScalar(100, 1.0, 600, 0.35),
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
  };
}

/** Draw the axis gizmo for the given anchor and return the created entities. */
export function renderAxes(viewer: Cesium.Viewer, anchor: SiteAnchor): Cesium.Entity[] {
  const origin = localCartesian(anchor, 0, 0, 0);

  const axes = [
    { end: localCartesian(anchor, 20, 0, 0), color: Cesium.Color.RED, label: '+X SR' },
    { end: localCartesian(anchor, 0, 20, 0), color: Cesium.Color.LIME, label: '+Y AUD' },
    { end: localCartesian(anchor, 0, 0, 10), color: Cesium.Color.BLUE, label: '+Z' },
  ] as const;

  const entities: Cesium.Entity[] = [];
  for (const axis of axes) {
    entities.push(
      viewer.entities.add({
        polyline: {
          positions: [origin, axis.end],
          width: 6,
          material: new Cesium.PolylineArrowMaterialProperty(axis.color),
        },
      }),
    );
    entities.push(
      viewer.entities.add({
        position: axis.end,
        label: labelOptions(axis.label),
      }),
    );
  }
  return entities;
}
