/**
 * Cesium rendering of a scene document.
 *
 * Orientation rule: the box orientation is built from geo-core's `localToEcefMatrix(anchor)`
 * (its 3x3 rotation part), then the element's `rotationDeg` about local +Z is applied. We never
 * derive orientation from Cesium's HeadingPitchRoll conventions.
 */

import * as Cesium from 'cesium';

import {
  geodeticToEcef,
  isSimpleRing,
  localToEcefMatrix,
  localToGeodetic,
  type Geodetic,
  type Mat4,
  type SiteAnchor,
  type Tmm,
} from '@overlord/geo-core';
import {
  isLinearElement,
  isPlacedElement,
  zoneAreaSqFt,
  type ElementTypeRegistry,
  type Ring2,
  type SceneDoc,
  type SceneElement,
} from '@overlord/scene';

import { elementCornersLocal, type Placeable } from '../site/placement.js';

const TMM_PER_M = 10000;
const LABEL_FAR_M = 600;
const ZONE_COLOR = Cesium.Color.fromCssColorString('#facc15');
const SELECTION_COLOR = Cesium.Color.fromCssColorString('#22d3ee');
const MEASURE_COLOR = Cesium.Color.fromCssColorString('#f97316');

export interface RenderOptions {
  /** Called when an element or zone is skipped because its ring is not simple. */
  onWarning?: (message: string) => void;
  /** Id of the selected element or zone; it is outlined in the selection colour. */
  selected?: string | null;
}

function toCartesian(g: Geodetic): Cesium.Cartesian3 {
  const [x, y, z] = geodeticToEcef(g);
  return new Cesium.Cartesian3(x, y, z);
}

/** 3x3 rotation (local metres -> ECEF) from geo-core's column-major Mat4. */
/**
 * A closed ribbon ring around an open path: each vertex is offset by half the width along the
 * averaged normal of its adjacent segments, then the far side is walked back.
 */
function ribbonRing(path: Ring2, widthTmm: number): Ring2 {
  const half = (widthTmm as number) / 2;
  const left: Ring2 = [];
  const right: Ring2 = [];
  for (let index = 0; index < path.length; index += 1) {
    const current = path[index];
    if (current === undefined) {
      continue;
    }
    const previous = path[index - 1] ?? current;
    const next = path[index + 1] ?? current;
    let dx = (next.x as number) - (previous.x as number);
    let dy = (next.y as number) - (previous.y as number);
    const length = Math.hypot(dx, dy);
    if (length === 0) {
      dx = 1;
      dy = 0;
    } else {
      dx /= length;
      dy /= length;
    }
    // Normal is the perpendicular of the averaged direction.
    const nx = dy;
    const ny = -dx;
    left.push({
      x: Math.round((current.x as number) + nx * half) as never,
      y: Math.round((current.y as number) + ny * half) as never,
    });
    right.push({
      x: Math.round((current.x as number) - nx * half) as never,
      y: Math.round((current.y as number) - ny * half) as never,
    });
  }
  return [...left, ...right.reverse()];
}

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

function labelFor(text: string): Cesium.LabelGraphics.ConstructorOptions {
  return {
    text,
    font: '14px sans-serif',
    fillColor: Cesium.Color.WHITE,
    outlineColor: Cesium.Color.BLACK,
    outlineWidth: 2,
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
    pixelOffset: new Cesium.Cartesian2(0, -12),
    // Labels only within 600 m and shrinking with distance; never depth-tested away.
    distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, LABEL_FAR_M),
    scaleByDistance: new Cesium.NearFarScalar(100, 1.0, LABEL_FAR_M, 0.35),
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
  };
}

function renderPolygon(
  viewer: Cesium.Viewer,
  anchor: SiteAnchor,
  id: string,
  label: string,
  ring: { x: Tmm; y: Tmm }[],
  color: Cesium.Color,
  selected: boolean,
): Cesium.Entity {
  const positions = ring.map((point) =>
    toCartesian(localToGeodetic(anchor, { x: point.x, y: point.y, z: 0 as Tmm })),
  );
  return viewer.entities.add({
    id,
    name: label,
    position: toCartesian(
      localToGeodetic(anchor, {
        x: Math.round(ring.reduce((sum, point) => sum + (point.x as number), 0) / ring.length) as Tmm,
        y: Math.round(ring.reduce((sum, point) => sum + (point.y as number), 0) / ring.length) as Tmm,
        z: 0 as Tmm,
      }),
    ),
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy(positions),
      material: color.withAlpha(selected ? 0.45 : 0.25),
      outline: true,
      outlineColor: selected ? SELECTION_COLOR : color.withAlpha(0.9),
      perPositionHeight: true,
    },
    label: labelFor(label),
  });
}

function renderBox(
  viewer: Cesium.Viewer,
  anchor: SiteAnchor,
  element: SceneElement,
  placeable: Placeable,
  baseRotation: Cesium.Matrix3,
  color: Cesium.Color,
  selected: boolean,
): Cesium.Entity {
  const position = toCartesian(localToGeodetic(anchor, placeable.center));

  // rotationDeg is clockwise positive about local +Z; Cesium's fromRotationZ is CCW positive.
  const elementRotation = Cesium.Matrix3.fromRotationZ(
    -Cesium.Math.toRadians(placeable.rotationDeg),
  );
  const orientationMatrix = Cesium.Matrix3.multiply(baseRotation, elementRotation, new Cesium.Matrix3());
  const orientation = Cesium.Quaternion.fromRotationMatrix(orientationMatrix);

  return viewer.entities.add({
    id: element.id,
    name: element.label,
    position,
    orientation,
    box: {
      dimensions: new Cesium.Cartesian3(
        (placeable.size.x as number) / TMM_PER_M,
        (placeable.size.y as number) / TMM_PER_M,
        (placeable.size.z as number) / TMM_PER_M,
      ),
      material: color.withAlpha(selected ? 0.95 : 0.85),
      outline: true,
      outlineColor: selected ? SELECTION_COLOR : Cesium.Color.WHITE,
    },
    label: labelFor(element.label),
  });
}

/** Render a scene document for an anchor and return the created entities. */
export function renderScene(
  viewer: Cesium.Viewer,
  anchor: SiteAnchor,
  scene: SceneDoc,
  registry: ElementTypeRegistry,
  options: RenderOptions = {},
): Cesium.Entity[] {
  const baseRotation = matrix3FromMat4(localToEcefMatrix(anchor));
  const entities: Cesium.Entity[] = [];
  const selected = options.selected ?? null;

  for (const element of scene.elements) {
    const type = registry.get(element.typeCode);
    const color = type === undefined ? Cesium.Color.LIGHTGRAY : Cesium.Color.fromCssColorString(type.color);
    const isSelected = selected === element.id;

    // A LINEAR element renders as a ribbon of its width along the open path.
    if (isLinearElement(element)) {
      const ring = ribbonRing(element.path.value, element.widthTmm);
      if (ring.length < 3 || !isSimpleRing(ring)) {
        options.onWarning?.(`Skipped ${element.id}: ribbon is not a simple ring`);
        continue;
      }
      entities.push(renderPolygon(viewer, anchor, element.id, element.label, ring, color, isSelected));
      continue;
    }

    if (!isPlacedElement(element)) {
      continue;
    }

    const placeable: Placeable = {
      center: element.placement.value.center,
      size: element.size.value,
      rotationDeg: element.placement.value.rotationDeg,
    };

    if (type?.geometry === 'FLAT' || element.size.value.z === 0) {
      const ring = elementCornersLocal(placeable);
      if (!isSimpleRing(ring)) {
        options.onWarning?.(`Skipped ${element.id}: footprint ring is not simple`);
        continue;
      }
      entities.push(renderPolygon(viewer, anchor, element.id, element.label, ring, color, isSelected));
    } else {
      entities.push(renderBox(viewer, anchor, element, placeable, baseRotation, color, isSelected));
    }
  }

  for (const zone of scene.zones) {
    const ring = zone.ring.value;
    if (!isSimpleRing(ring)) {
      options.onWarning?.(`Skipped zone ${zone.id}: ring is not simple`);
      continue;
    }
    entities.push(renderPolygon(viewer, anchor, zone.id, zone.label, ring, ZONE_COLOR, selected === zone.id));
  }

  for (const measurement of scene.measurements ?? []) {
    const points = measurement.points;
    if (points.length < 2) {
      continue;
    }
    const positions = points.map((point) => toCartesian(localToGeodetic(anchor, point)));
    if (measurement.kind === 'AREA' && positions.length >= 3) {
      const value = `${Math.round(zoneAreaSqFt(points as never)).toLocaleString('en-US')} sq ft`;
      entities.push(
        viewer.entities.add({
          id: measurement.id,
          name: measurement.label,
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(positions),
            material: MEASURE_COLOR.withAlpha(0.2),
            outline: true,
            outlineColor: MEASURE_COLOR,
            perPositionHeight: true,
          },
          label: labelFor(`${measurement.label}: ${value}`),
        }),
      );
    } else {
      let distanceM = 0;
      for (let index = 1; index < positions.length; index += 1) {
        const previous = positions[index - 1];
        const current = positions[index];
        if (previous !== undefined && current !== undefined) {
          distanceM += Cesium.Cartesian3.distance(previous, current);
        }
      }
      const value = `${(distanceM / 0.3048).toFixed(1)} ft`;
      entities.push(
        viewer.entities.add({
          id: measurement.id,
          name: measurement.label,
          polyline: { positions, width: 3, material: MEASURE_COLOR, clampToGround: true },
          label: labelFor(`${measurement.label}: ${value}`),
        }),
      );
    }
  }

  return entities;
}
