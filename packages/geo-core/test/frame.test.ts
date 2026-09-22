import { describe, expect, it } from 'vitest';
import {
  ecefToGeodetic,
  geodeticToEcef,
  geodeticToLocal,
  localToEcefMatrix,
  localToGeodetic,
  type Geodetic,
  type LocalPoint,
  type Mat4,
  type SiteAnchor,
  type Tmm,
  type Vec3,
} from '../src/index.js';

const D2R = Math.PI / 180;
const MM = 1; // 1 tmm = 0.1 mm
const M = 10000; // 1 m in tmm

/** Test helper: build a local point from integer tmm. */
function point(x: number, y: number, z: number): LocalPoint {
  return { x: x as Tmm, y: y as Tmm, z: z as Tmm };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Independent ENU offset of a geodetic point relative to an anchor, computed from the anchor's lat/lon. */
function enuOf(anchor: SiteAnchor, g: Geodetic): { east: number; north: number; up: number } {
  const lat = anchor.latDeg * D2R;
  const lon = anchor.lonDeg * D2R;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);
  const east: Vec3 = [-sinLon, cosLon, 0];
  const north: Vec3 = [-sinLat * cosLon, -sinLat * sinLon, cosLat];
  const up: Vec3 = [cosLat * cosLon, cosLat * sinLon, sinLat];
  const delta = sub(geodeticToEcef(g), geodeticToEcef(anchor));
  return { east: dot(delta, east), north: dot(delta, north), up: dot(delta, up) };
}

function applyMatrix(m: Mat4, x: number, y: number, z: number): Vec3 {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

const KOLKATA = { latDeg: 22.5626, lonDeg: 88.3444, heightM: 10 };
const anchors: Array<Omit<SiteAnchor, 'headingDeg'>> = [
  KOLKATA,
  { latDeg: 60, lonDeg: 10, heightM: 0 },
  { latDeg: -33.9, lonDeg: 151.2, heightM: 50 },
];

describe('WGS84 ECEF round trip', () => {
  it('recovers geodetic coordinates', () => {
    for (const base of anchors) {
      const ecef = geodeticToEcef(base);
      const back = ecefToGeodetic(ecef);
      expect(Math.abs(back.latDeg - base.latDeg)).toBeLessThan(1e-9);
      expect(Math.abs(back.lonDeg - base.lonDeg)).toBeLessThan(1e-9);
      expect(Math.abs(back.heightM - base.heightM)).toBeLessThan(1e-6);
    }
  });

  it('converges latitude to better than 1e-11 rad', () => {
    const base = { latDeg: 45, lonDeg: -120, heightM: 1234.5 };
    const [x, y, z] = geodeticToEcef(base);
    const first = ecefToGeodetic([x, y, z]);
    // Re-solve and confirm the fixed point is stable to the required tolerance.
    const second = ecefToGeodetic(geodeticToEcef(first));
    expect(Math.abs(first.latDeg - second.latDeg) * D2R).toBeLessThan(1e-11);
  });
});

describe('local frame orientation', () => {
  it('heading 0: local +Y lands north of the anchor, with negligible east offset', () => {
    const anchor: SiteAnchor = { ...KOLKATA, headingDeg: 0 };
    const enu = enuOf(anchor, localToGeodetic(anchor, point(0, 1000 * M, 0)));
    expect(Math.abs(enu.east)).toBeLessThan(1 * MM);
    expect(Math.abs(enu.north - 1000)).toBeLessThan(1 * MM);
  });

  it('heading 90: local +Y lands east of the anchor', () => {
    const anchor: SiteAnchor = { ...KOLKATA, headingDeg: 90 };
    const enu = enuOf(anchor, localToGeodetic(anchor, point(0, 1000 * M, 0)));
    expect(Math.abs(enu.east - 1000)).toBeLessThan(1 * MM);
    expect(Math.abs(enu.north)).toBeLessThan(1 * MM);
  });

  it('local +X is exactly 90 degrees clockwise from local +Y', () => {
    for (const headingDeg of [0, 90, 217.5]) {
      const anchor: SiteAnchor = { ...KOLKATA, headingDeg };
      const alongY = enuOf(anchor, localToGeodetic(anchor, point(0, 1000 * M, 0)));
      const alongX = enuOf(anchor, localToGeodetic(anchor, point(1000 * M, 0, 0)));
      const azY = Math.atan2(alongY.east, alongY.north) / D2R;
      const azX = Math.atan2(alongX.east, alongX.north) / D2R;
      const diff = (((azX - azY) % 360) + 360) % 360;
      expect(Math.abs(diff - 90)).toBeLessThan(1e-6);
    }
  });

  it('keeps +Z up', () => {
    const anchor: SiteAnchor = { ...KOLKATA, headingDeg: 33 };
    const enu = enuOf(anchor, localToGeodetic(anchor, point(0, 0, 50 * M)));
    expect(Math.abs(enu.up - 50)).toBeLessThan(1 * MM);
  });
});

describe('local <-> geodetic round trip', () => {
  it('is within 1 tmm over a grid up to 2 km and -10 m to +50 m', () => {
    for (const base of anchors) {
      for (const headingDeg of [0, 45, 90, 180, 217.5, 300]) {
        const anchor: SiteAnchor = { ...base, headingDeg };
        for (const xm of [-2000, -1000, 0, 1000, 2000]) {
          for (const ym of [-2000, 0, 2000]) {
            for (const zm of [-10, 0, 50]) {
              const original = point(xm * M, ym * M, zm * M);
              const back = geodeticToLocal(anchor, localToGeodetic(anchor, original));
              expect(Math.abs(back.x - original.x)).toBeLessThanOrEqual(1);
              expect(Math.abs(back.y - original.y)).toBeLessThanOrEqual(1);
              expect(Math.abs(back.z - original.z)).toBeLessThanOrEqual(1);
            }
          }
        }
      }
    }
  });
});

describe('localToEcefMatrix', () => {
  it('matches localToGeodetic -> geodeticToEcef within 1 mm', () => {
    for (const base of anchors) {
      const anchor: SiteAnchor = { ...base, headingDeg: 217.5 };
      const m = localToEcefMatrix(anchor);

      const localMetres = { x: 123.456, y: -789.012, z: 34.5 };
      const viaMatrix = applyMatrix(m, localMetres.x, localMetres.y, localMetres.z);

      const geodetic = localToGeodetic(
        anchor,
        point(Math.round(localMetres.x * M), Math.round(localMetres.y * M), Math.round(localMetres.z * M)),
      );
      const viaGeodetic = geodeticToEcef(geodetic);

      expect(Math.abs(viaMatrix[0] - viaGeodetic[0])).toBeLessThan(1e-3);
      expect(Math.abs(viaMatrix[1] - viaGeodetic[1])).toBeLessThan(1e-3);
      expect(Math.abs(viaMatrix[2] - viaGeodetic[2])).toBeLessThan(1e-3);
    }
  });

  it('is column-major with a unit translation in row 4', () => {
    const anchor: SiteAnchor = { ...KOLKATA, headingDeg: 0 };
    const m = localToEcefMatrix(anchor);
    expect(m[3]).toBe(0);
    expect(m[7]).toBe(0);
    expect(m[11]).toBe(0);
    expect(m[15]).toBe(1);
    expect(m.length).toBe(16);
  });
});
