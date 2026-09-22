/**
 * Named viewpoint buttons. All camera positions are computed from the site frame with geo-core,
 * never from hardcoded latitude/longitude.
 */

import * as Cesium from 'cesium';

import { geodeticToEcef, localToGeodetic, type SiteAnchor, type Tmm } from '@overlord/geo-core';

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

function flyTo(
  viewer: Cesium.Viewer,
  anchor: SiteAnchor,
  destination: Cesium.Cartesian3,
  headingOffsetDeg: number,
  pitchDeg: number,
): void {
  viewer.camera.flyTo({
    destination,
    orientation: {
      heading: Cesium.Math.toRadians(anchor.headingDeg + headingOffsetDeg),
      pitch: Cesium.Math.toRadians(pitchDeg),
      roll: 0,
    },
    duration: 2,
  });
}

/** Create the Aerial / FOH / Stage buttons inside `container`. */
export function createViewpointButtons(
  viewer: Cesium.Viewer,
  getAnchor: () => SiteAnchor,
  container: HTMLElement,
): void {
  const toolbar = document.createElement('div');
  toolbar.className = 'viewpoints';

  const definitions: Array<{ label: string; run: () => void }> = [
    {
      label: 'Aerial',
      run: () => {
        const anchor = getAnchor();
        // Above the site centre, straight down; heading keeps +Y audience to the top of the screen.
        flyTo(viewer, anchor, localCartesian(anchor, 0, 30, 250), 0, -90);
      },
    },
    {
      label: 'FOH',
      run: () => {
        const anchor = getAnchor();
        // From the FOH console at 1.7 m eye height, looking back toward the stage (-Y).
        flyTo(viewer, anchor, localCartesian(anchor, 0, 120 * FT_TO_M, 1.7), 180, -5);
      },
    },
    {
      label: 'Stage',
      run: () => {
        const anchor = getAnchor();
        // From the stage downstage edge at 3 m, looking out toward the audience (+Y).
        flyTo(viewer, anchor, localCartesian(anchor, 0, 0, 3), 0, -5);
      },
    },
  ];

  for (const definition of definitions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = definition.label;
    button.addEventListener('click', definition.run);
    toolbar.appendChild(button);
  }

  container.appendChild(toolbar);
}
