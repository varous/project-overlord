/**
 * Cesium rendering of site elements.
 *
 * Orientation rule: the box orientation is built from geo-core's `localToEcefMatrix(anchor)`
 * (its 3x3 rotation part), then the element's `rotationDeg` about local +Z is applied. We never
 * derive orientation from Cesium's HeadingPitchRoll conventions.
 */

import * as Cesium from 'cesium';

import {
  geodeticToEcef,
  localToEcefMatrix,
  localToGeodetic,
  type Geodetic,
  type Mat4,
  type SiteAnchor,
} from '@overlord/geo-core';

import type { ElementType, SiteElement } from '../site/demoSite.js';
import { elementCornersLocal } from '../site/placement.js';

const TMM_PER_M = 10000;

const TYPE_COLORS: Record<ElementType, Cesium.Color> = {
  stage: Cesium.Color.fromCssColorString('#d64545'),
  riser: Cesium.Color.fromCssColorString('#3b82f6'),
  green_room: Cesium.Color.fromCssColorString('#22c55e'),
  audience_zone: Cesium.Color.fromCssColorString('#facc15'),
};

function toCartesian(g: Geodetic): Cesium.Cartesian3 {
  const [x, y, z] = geodeticToEcef(g);
  return new Cesium.Cartesian3(x, y, z);
}

/** 3x3 rotation (local metres -> ECEF) from geo-core's column-major Mat4. */
function matrix3FromMat4(m: Mat4): Cesium.Matrix3 {
  return Cesium.Matrix3.fromColumnMajorArray([
    m[0],
    m[1],
    m[2],
    m[4],
    m[5],
    m[6],
    m[8],
    m[9],
    m[10],
  ]);
}

function labelFor(element: SiteElement): Cesium.LabelGraphics.ConstructorOptions {
  return {
    text: element.label,
    font: '14px sans-serif',
    fillColor: Cesium.Color.WHITE,
    outlineColor: Cesium.Color.BLACK,
    outlineWidth: 2,
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
    pixelOffset: new Cesium.Cartesian2(0, -12),
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
  };
}

function renderFlatZone(viewer: Cesium.Viewer, anchor: SiteAnchor, element: SiteElement): Cesium.Entity {
  const positions = elementCornersLocal(element).map((corner) =>
    toCartesian(localToGeodetic(anchor, corner)),
  );

  return viewer.entities.add({
    id: element.id,
    name: element.label,
    position: toCartesian(localToGeodetic(anchor, element.center)),
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy(positions),
      material: TYPE_COLORS.audience_zone.withAlpha(0.25),
      outline: true,
      outlineColor: TYPE_COLORS.audience_zone.withAlpha(0.9),
      perPositionHeight: true,
    },
    label: labelFor(element),
  });
}

function renderBox(
  viewer: Cesium.Viewer,
  anchor: SiteAnchor,
  element: SiteElement,
  baseRotation: Cesium.Matrix3,
): Cesium.Entity {
  const position = toCartesian(localToGeodetic(anchor, element.center));

  // rotationDeg is clockwise positive about local +Z; Cesium's fromRotationZ is CCW positive.
  const elementRotation = Cesium.Matrix3.fromRotationZ(-Cesium.Math.toRadians(element.rotationDeg));
  const orientationMatrix = Cesium.Matrix3.multiply(baseRotation, elementRotation, new Cesium.Matrix3());
  const orientation = Cesium.Quaternion.fromRotationMatrix(orientationMatrix);

  return viewer.entities.add({
    id: element.id,
    name: element.label,
    position,
    orientation,
    box: {
      dimensions: new Cesium.Cartesian3(
        (element.size.x as number) / TMM_PER_M,
        (element.size.y as number) / TMM_PER_M,
        (element.size.z as number) / TMM_PER_M,
      ),
      material: TYPE_COLORS[element.type].withAlpha(0.85),
      outline: true,
      outlineColor: Cesium.Color.WHITE,
    },
    label: labelFor(element),
  });
}

/** Render all elements for an anchor and return the created entities. */
export function renderElements(
  viewer: Cesium.Viewer,
  anchor: SiteAnchor,
  elements: SiteElement[],
): Cesium.Entity[] {
  const baseRotation = matrix3FromMat4(localToEcefMatrix(anchor));
  return elements.map((element) =>
    element.size.z === 0
      ? renderFlatZone(viewer, anchor, element)
      : renderBox(viewer, anchor, element, baseRotation),
  );
}
