/**
 * Deterministic placement math. PURE module: it must not import Cesium.
 *
 * Corners are returned in local site coordinates (tmm), with the element's `rotationDeg`
 * applied about +Z (clockwise positive, relative to site +Y) and the element centre added.
 */

import { localToGeodetic, type Geodetic, type LocalPoint, type SiteAnchor, type Tmm } from '@overlord/geo-core';

import type { SiteElement } from './demoSite.js';

/**
 * Local corners of an element: 8 for a box, 4 for a flat zone (`size.z === 0`).
 */
export function elementCornersLocal(element: SiteElement): LocalPoint[] {
  const halfX = (element.size.x as number) / 2;
  const halfY = (element.size.y as number) / 2;
  const halfZ = (element.size.z as number) / 2;

  const radians = (element.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  const corner = (dx: number, dy: number, dz: number): LocalPoint => ({
    x: Math.round((element.center.x as number) + dx * cos + dy * sin) as Tmm,
    y: Math.round((element.center.y as number) - dx * sin + dy * cos) as Tmm,
    z: Math.round((element.center.z as number) + dz) as Tmm,
  });

  if (element.size.z === 0) {
    return [
      corner(-halfX, -halfY, 0),
      corner(halfX, -halfY, 0),
      corner(-halfX, halfY, 0),
      corner(halfX, halfY, 0),
    ];
  }

  return [
    corner(-halfX, -halfY, -halfZ),
    corner(halfX, -halfY, -halfZ),
    corner(-halfX, halfY, -halfZ),
    corner(halfX, halfY, -halfZ),
    corner(-halfX, -halfY, halfZ),
    corner(halfX, -halfY, halfZ),
    corner(-halfX, halfY, halfZ),
    corner(halfX, halfY, halfZ),
  ];
}

/** Geographic corners of an element for the given anchor. */
export function elementCornersGeodetic(anchor: SiteAnchor, element: SiteElement): Geodetic[] {
  return elementCornersLocal(element).map((corner) => localToGeodetic(anchor, corner));
}
