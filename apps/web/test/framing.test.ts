import { describe, expect, it } from 'vitest';

import { type SceneDoc } from '@overlord/scene';

import {
  DEFAULT_FOV_DEG,
  MAX_ALTITUDE_M,
  MIN_ALTITUDE_M,
  boundsCentreLocal,
  boundsDepthM,
  boundsWidthM,
  fitAltitudeM,
  sceneBoundsLocal,
} from '../src/viewer/framing.js';

const emptyScene: SceneDoc = {
  schemaVersion: 1,
  id: 'scn_empty0000000000000',
  name: 'Empty',
  site: {
    anchor: {
      value: { latDeg: 22.5, lonDeg: 88.4, heightM: 0, headingDeg: 0 },
      provenance: 'STATED',
    },
    boundary: null,
    imagery: { provider: 'ESRI', captureDate: null },
  },
  elements: [],
  zones: [],
  viewpoints: [],
};

function bounds(widthM: number, depthM: number) {
  const halfW = (widthM * 10000) / 2;
  const halfD = (depthM * 10000) / 2;
  return { minX: -halfW, maxX: halfW, minY: -halfD, maxY: halfD } as never;
}

describe('sceneBoundsLocal', () => {
  it('returns a 60 m square around the origin for an empty scene', () => {
    const result = sceneBoundsLocal(emptyScene);
    expect(boundsWidthM(result)).toBeCloseTo(60, 6);
    expect(boundsDepthM(result)).toBeCloseTo(60, 6);
    expect(boundsCentreLocal(result)).toEqual({ x: 0, y: 0 });
  });

  it('covers element corners and zone rings', () => {
    const doc: SceneDoc = {
      ...emptyScene,
      elements: [
        {
          id: 'e1',
          typeCode: 'RISER',
          label: 'Riser 1',
          placement: {
            value: { center: { x: 0, y: 0, z: 0 }, rotationDeg: 0 },
            provenance: 'STATED',
          },
          size: { value: { x: 100000, y: 200000, z: 10000 }, provenance: 'STATED' },
          params: {},
        },
      ],
      zones: [
        {
          id: 'z1',
          kind: 'AUDIENCE',
          label: 'Audience',
          ring: {
            value: [
              { x: -300000, y: -100000 },
              { x: 300000, y: -100000 },
              { x: 300000, y: 500000 },
              { x: -300000, y: 500000 },
            ],
            provenance: 'STATED',
          },
        },
      ],
    } as never;
    const result = sceneBoundsLocal(doc);
    expect(result.minX).toBe(-300000);
    expect(result.maxX).toBe(300000);
    expect(result.minY).toBe(-100000);
    expect(result.maxY).toBe(500000);
  });
});

describe('fitAltitudeM', () => {
  it('uses the 300 m floor for a 76 m x 79 m scene at 16:10, 60 degree fov', () => {
    expect(fitAltitudeM(bounds(76, 79), 16 / 10, DEFAULT_FOV_DEG, 1.4)).toBe(MIN_ALTITUDE_M);
  });

  it('zooms out for a 900 m x 900 m scene', () => {
    const altitude = fitAltitudeM(bounds(900, 900), 16 / 10, DEFAULT_FOV_DEG, 1.4);
    expect(altitude).toBeGreaterThan(MIN_ALTITUDE_M);
    expect(altitude).toBeLessThan(MAX_ALTITUDE_M);
    // halfDepth 450 * 1.4 / tan(30°) ≈ 1091 m
    expect(altitude).toBeCloseTo(1091, 0);
  });

  it('clamps a 20 km scene to the 3000 m ceiling', () => {
    expect(fitAltitudeM(bounds(20000, 20000), 16 / 10, DEFAULT_FOV_DEG, 1.4)).toBe(MAX_ALTITUDE_M);
  });

  it('uses the horizontal field of view for very wide scenes', () => {
    const wide = fitAltitudeM(bounds(2000, 100), 2.0, DEFAULT_FOV_DEG, 1.0);
    const deep = fitAltitudeM(bounds(100, 2000), 2.0, DEFAULT_FOV_DEG, 1.0);
    expect(wide).toBeLessThan(deep);
    expect(wide).toBeGreaterThan(MIN_ALTITUDE_M);
    expect(deep).toBeLessThan(MAX_ALTITUDE_M);
  });
});
