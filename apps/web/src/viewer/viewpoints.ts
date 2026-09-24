/**
 * Named viewpoints. All camera positions are computed from the site frame with geo-core,
 * never from hardcoded latitude/longitude. Aerial/Fit are framed on the current scene bounds.
 */

import * as Cesium from 'cesium';

import { geodeticToEcef, localToGeodetic, type SiteAnchor, type Tmm } from '@overlord/geo-core';
import type { SceneDoc } from '@overlord/scene';

import {
  AERIAL_PITCH_DEG,
  boundsCentreLocal,
  fitAltitudeM,
  sceneBoundsLocal,
} from './framing.js';

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

export interface Framing {
  centre: { x: Tmm; y: Tmm };
  altitudeM: number;
}

/** Fit the current scene for the current canvas aspect ratio (used by Aerial and Fit). */
export function computeAerialFraming(doc: SceneDoc, aspectRatio: number): Framing {
  const bounds = sceneBoundsLocal(doc);
  return {
    centre: boundsCentreLocal(bounds),
    altitudeM: fitAltitudeM(bounds, aspectRatio),
  };
}

/** The fitted Aerial altitude in metres, for tests and the smoke hook. */
export function aerialAltitudeM(doc: SceneDoc, aspectRatio: number): number {
  return computeAerialFraming(doc, aspectRatio).altitudeM;
}

interface Viewpoint {
  destination: Cesium.Cartesian3;
  headingOffsetDeg: number;
  pitchDeg: number;
}

function viewpoint(
  anchor: SiteAnchor,
  name: ViewpointName,
  framing: Framing | null,
): Viewpoint {
  switch (name) {
    case 'Aerial': {
      if (framing === null) {
        return {
          destination: localCartesian(anchor, 0, 30, 250),
          headingOffsetDeg: 0,
          pitchDeg: -90,
        };
      }
      return {
        destination: localCartesian(
          anchor,
          (framing.centre.x as number) / TMM_PER_M,
          (framing.centre.y as number) / TMM_PER_M,
          framing.altitudeM,
        ),
        headingOffsetDeg: 0,
        pitchDeg: AERIAL_PITCH_DEG,
      };
    }
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

export interface FlyOptions {
  /** The current scene; when given, Aerial is framed on its bounds. */
  doc?: SceneDoc;
  aspectRatio?: number;
}

/** Fly to a named viewpoint; resolves when the camera flight completes or is cancelled. */
export function flyToViewpoint(
  viewer: Cesium.Viewer,
  anchor: SiteAnchor,
  name: ViewpointName,
  options: FlyOptions = {},
): Promise<void> {
  const framing =
    options.doc === undefined
      ? null
      : computeAerialFraming(options.doc, options.aspectRatio ?? 16 / 10);
  const target = viewpoint(anchor, name, framing);
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

/** Create the Aerial / FOH / Stage / Fit buttons inside `container`. */
export function createViewpointButtons(
  container: HTMLElement,
  onSelect: (name: ViewpointName) => void,
  onFit?: () => void,
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

  if (onFit !== undefined) {
    const fitButton = document.createElement('button');
    fitButton.type = 'button';
    fitButton.textContent = 'Fit';
    fitButton.dataset.action = 'fit';
    fitButton.title = 'Fit the whole scene (F)';
    fitButton.addEventListener('click', onFit);
    toolbar.appendChild(fitButton);
  }

  container.appendChild(toolbar);
}
