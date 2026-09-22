/**
 * WGS84-anchored site coordinate frame.
 *
 * Local frame (right-handed):
 *   origin at the downstage-centre edge of the main stage,
 *   +Y toward the audience, +Z up, +X stage right.
 * The frame is tied to WGS84 by a `SiteAnchor`: a geodetic origin plus a heading, defined as the
 * clockwise angle in degrees from true north to local +Y.
 *
 * Pure math only: no Cesium, no third-party libraries.
 */

import type { Tmm } from './units.js';

/** WGS84 semi-major axis, metres. */
export const WGS84_A = 6378137.0;
/** WGS84 flattening. */
export const WGS84_F = 1 / 298.257223563;
/** WGS84 semi-minor axis, metres. */
export const WGS84_B = WGS84_A * (1 - WGS84_F);
/** WGS84 first eccentricity squared. */
export const WGS84_E2 = WGS84_F * (2 - WGS84_F);

/** Number of tmm in one metre. */
const TMM_PER_M = 10000;
const DEG_TO_RAD = Math.PI / 180;

export interface SiteAnchor {
  latDeg: number;
  lonDeg: number;
  /** Ellipsoidal height in metres. */
  heightM: number;
  /** Clockwise angle in degrees from true north to local +Y. */
  headingDeg: number;
}

export interface LocalPoint {
  x: Tmm;
  y: Tmm;
  z: Tmm;
}

export interface Geodetic {
  latDeg: number;
  lonDeg: number;
  /** Ellipsoidal height in metres. */
  heightM: number;
}

export type Vec3 = readonly [number, number, number];

/** Column-major 4x4 matrix, 16 numbers. */
export type Mat4 = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

export function degToRad(deg: number): number {
  return deg * DEG_TO_RAD;
}

export function radToDeg(rad: number): number {
  return rad / DEG_TO_RAD;
}

/**
 * Geodetic (degrees, metres) to Earth-Centred Earth-Fixed (metres).
 */
export function geodeticToEcef(g: Geodetic): Vec3 {
  const lat = g.latDeg * DEG_TO_RAD;
  const lon = g.lonDeg * DEG_TO_RAD;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);

  const primeVertical = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  const x = (primeVertical + g.heightM) * cosLat * cosLon;
  const y = (primeVertical + g.heightM) * cosLat * sinLon;
  const z = (primeVertical * (1 - WGS84_E2) + g.heightM) * sinLat;
  return [x, y, z];
}

/**
 * Earth-Centred Earth-Fixed (metres) to geodetic (degrees, metres).
 *
 * Latitude is found by fixed-point iteration until it changes by less than 1e-14 rad,
 * well inside the required 1e-11 rad.
 */
export function ecefToGeodetic(p: Vec3): Geodetic {
  const [x, y, z] = p;
  const lon = Math.atan2(y, x);
  const horizontal = Math.hypot(x, y);

  let lat = Math.atan2(z, horizontal * (1 - WGS84_E2));
  let heightM = 0;

  for (let i = 0; i < 100; i += 1) {
    const sinLat = Math.sin(lat);
    const primeVertical = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
    heightM = horizontal / Math.cos(lat) - primeVertical;
    const nextLat = Math.atan2(
      z,
      horizontal * (1 - (WGS84_E2 * primeVertical) / (primeVertical + heightM)),
    );
    if (Math.abs(nextLat - lat) < 1e-14) {
      lat = nextLat;
      break;
    }
    lat = nextLat;
  }

  const sinLat = Math.sin(lat);
  const primeVertical = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  heightM = horizontal / Math.cos(lat) - primeVertical;

  return { latDeg: radToDeg(lat), lonDeg: radToDeg(lon), heightM };
}

interface EnuBasis {
  east: Vec3;
  north: Vec3;
  up: Vec3;
}

function enuBasis(latDeg: number, lonDeg: number): EnuBasis {
  const lat = latDeg * DEG_TO_RAD;
  const lon = lonDeg * DEG_TO_RAD;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);
  return {
    east: [-sinLon, cosLon, 0],
    north: [-sinLat * cosLon, -sinLat * sinLon, cosLat],
    up: [cosLat * cosLon, cosLat * sinLon, sinLat],
  };
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Local site point (tmm) to geodetic.
 *
 * Local (x, y) is rotated into East/North using the heading: local +Y maps to the direction
 * `headingDeg` clockwise from north, local +X maps to `headingDeg + 90`.
 */
export function localToGeodetic(anchor: SiteAnchor, p: LocalPoint): Geodetic {
  const xm = (p.x as number) / TMM_PER_M;
  const ym = (p.y as number) / TMM_PER_M;
  const zm = (p.z as number) / TMM_PER_M;

  const heading = anchor.headingDeg * DEG_TO_RAD;
  const cosH = Math.cos(heading);
  const sinH = Math.sin(heading);

  const east = xm * cosH + ym * sinH;
  const north = -xm * sinH + ym * cosH;

  const anchorEcef = geodeticToEcef(anchor);
  const { east: E, north: N, up: U } = enuBasis(anchor.latDeg, anchor.lonDeg);

  const ecef: Vec3 = [
    anchorEcef[0] + E[0] * east + N[0] * north + U[0] * zm,
    anchorEcef[1] + E[1] * east + N[1] * north + U[1] * zm,
    anchorEcef[2] + E[2] * east + N[2] * north + U[2] * zm,
  ];

  return ecefToGeodetic(ecef);
}

/**
 * Geodetic to local site point. The result is rounded to the nearest integer tmm.
 */
export function geodeticToLocal(anchor: SiteAnchor, g: Geodetic): LocalPoint {
  const anchorEcef = geodeticToEcef(anchor);
  const gEcef = geodeticToEcef(g);
  const d: Vec3 = [gEcef[0] - anchorEcef[0], gEcef[1] - anchorEcef[1], gEcef[2] - anchorEcef[2]];

  const { east: E, north: N, up: U } = enuBasis(anchor.latDeg, anchor.lonDeg);
  const east = dot(d, E);
  const north = dot(d, N);
  const up = dot(d, U);

  const heading = anchor.headingDeg * DEG_TO_RAD;
  const cosH = Math.cos(heading);
  const sinH = Math.sin(heading);

  const xm = east * cosH - north * sinH;
  const ym = east * sinH + north * cosH;

  return {
    x: Math.round(xm * TMM_PER_M) as Tmm,
    y: Math.round(ym * TMM_PER_M) as Tmm,
    z: Math.round(up * TMM_PER_M) as Tmm,
  };
}

/**
 * Column-major 4x4 matrix mapping LOCAL METRES to ECEF metres (future Cesium `modelMatrix`).
 *
 * NOTE: local points are in tmm. Divide by 10000 before applying this matrix; the matrix itself
 * only understands metres.
 */
export function localToEcefMatrix(anchor: SiteAnchor): Mat4 {
  const { east: E, north: N, up: U } = enuBasis(anchor.latDeg, anchor.lonDeg);
  const heading = anchor.headingDeg * DEG_TO_RAD;
  const cosH = Math.cos(heading);
  const sinH = Math.sin(heading);

  // Image of local +X: cosH * East - sinH * North.
  const cx: Vec3 = [
    cosH * E[0] - sinH * N[0],
    cosH * E[1] - sinH * N[1],
    cosH * E[2] - sinH * N[2],
  ];
  // Image of local +Y: sinH * East + cosH * North.
  const cy: Vec3 = [
    sinH * E[0] + cosH * N[0],
    sinH * E[1] + cosH * N[1],
    sinH * E[2] + cosH * N[2],
  ];
  // Image of local +Z: Up.
  const cz: Vec3 = [U[0], U[1], U[2]];

  const t = geodeticToEcef(anchor);

  return [
    cx[0], cx[1], cx[2], 0,
    cy[0], cy[1], cy[2], 0,
    cz[0], cz[1], cz[2], 0,
    t[0], t[1], t[2], 1,
  ];
}
