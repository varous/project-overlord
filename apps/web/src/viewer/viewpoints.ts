/**
 * Named viewpoints. All camera positions are computed from the site frame with geo-core,
 * never from hardcoded latitude/longitude.
 */

import * as Cesium from 'cesium';

import { geodeticToEcef, localToGeodetic, type SiteAnchor, type Tmm } from '@overlord/geo-core';

export type ViewpointName = 'Aerial' | 'FOH' | 'Stage';

export const VIEWPOINT_NAMES: readonly ViewpointName[] = ['Aerial', 'FOH', 'Stage'];

const TMM_PER_M = 10000;
const FT_TO_M = 0.3048;

function localCartesian(anchor: SiteAnchor, xM: number, yM: number, zM: number): Cesium.Cartesian3 {
  const point = {
    x: Math.round(xM * TMM_PER_M) as Tmm,
    y: Math.round(yM * TMM_PER_M) as Tmm,
    z: Math.round(zM * TMM_PER_M) as Tmm,
  };
  const [x, y, z] = geodeticToEcef(localToGeodetic(anchor, point));
  return new Cesium.Cartesian3(x, y, z);
}

interface Viewpoint {
  destination: Cesium.Cartesian3;
  headingOffsetDeg: number;
  pitchDeg: number;
}

function viewpoint(anchor: SiteAnchor, name: ViewpointName): Viewpoint {
  switch (name) {
    case 'Aerial':
      // Above the site centre, straight down; heading keeps +Y audience to the top of the screen.
      return {
        destination: localCartesian(anchor, 0, 30, 250),
        headingOffsetDeg: 0,
        pitchDeg: -90,
      };
    case 'FOH':
      // From the FOH console at 1.7 m eye height, looking back toward the stage (-Y).
      return {
        destination: localCartesian(anchor, 0, 120 * FT_TO_M, 1.7),
        headingOffsetDeg: 180,
        pitchDeg: -15,
      };
    case 'Stage':
      // From the stage downstage edge at 3 m, looking out toward the audience (+Y).
      return {
        destination: localCartesian(anchor, 0, 0, 3),
        headingOffsetDeg: 0,
        pitchDeg: -15,
      };
  }
}

/** Fly to a named viewpoint; resolves when the camera flight completes or is cancelled. */
export function flyToViewpoint(
  viewer: Cesium.Viewer,
  anchor: SiteAnchor,
  name: ViewpointName,
): Promise<void> {
  const target = viewpoint(anchor, name);
  return new Promise<void>((resolve) => {
    viewer.camera.flyTo({
      destination: target.destination,
      orientation: {
        heading: Cesium.Math.toRadians(anchor.headingDeg + target.headingOffsetDeg),
        pitch: Cesium.Math.toRadians(target.pitchDeg),
        roll: 0,
      },
      duration: 1.5,
      complete: () => {
        resolve();
      },
      cancel: () => {
        resolve();
      },
    });
  });
}

/** Create the Aerial / FOH / Stage buttons inside `container`. */
export function createViewpointButtons(
  container: HTMLElement,
  onSelect: (name: ViewpointName) => void,
): void {
  const toolbar = document.createElement('div');
  toolbar.className = 'viewpoints';

  for (const name of VIEWPOINT_NAMES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = name;
    button.addEventListener('click', () => {
      onSelect(name);
    });
    toolbar.appendChild(button);
  }

  container.appendChild(toolbar);
}
