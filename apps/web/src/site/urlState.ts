/**
 * URL site state. PURE module: no Cesium, no DOM access. It only takes and returns strings
 * and plain objects so it can be unit-tested directly.
 *
 * Recognised params: lat, lon, heading, stack, view, test.
 */

export type StackName = 'ESRI' | 'OSM' | 'GOOGLE_3D';
export type ViewName = 'Aerial' | 'FOH' | 'Stage';

export const STACK_NAMES: readonly StackName[] = ['ESRI', 'OSM', 'GOOGLE_3D'];
export const VIEW_NAMES: readonly ViewName[] = ['Aerial', 'FOH', 'Stage'];

export interface AnchorOverride {
  latDeg: number;
  lonDeg: number;
  headingDeg: number;
}

export interface UrlState {
  anchorOverride?: AnchorOverride;
  stack?: StackName;
  view?: ViewName;
  test: boolean;
  warnings: string[];
}

export interface UrlStateInput {
  anchorOverride?: AnchorOverride;
  stack?: StackName;
  view?: ViewName;
  test?: boolean;
}

/** Normalise any finite heading to [0, 360). */
export function normalizeHeading(headingDeg: number): number {
  return ((headingDeg % 360) + 360) % 360;
}

function parseNumber(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseUrlState(search: string): UrlState {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const warnings: string[] = [];

  const latRaw = params.get('lat');
  const lonRaw = params.get('lon');
  const headingRaw = params.get('heading');
  const lat = parseNumber(latRaw);
  const lon = parseNumber(lonRaw);

  let anchorOverride: AnchorOverride | undefined;
  if (latRaw !== null || lonRaw !== null) {
    const valid = lat !== undefined && lon !== undefined && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
    if (!valid) {
      warnings.push('Ignoring invalid lat/lon — using the default anchor.');
    } else {
      const heading = parseNumber(headingRaw);
      if (headingRaw !== null && heading === undefined) {
        warnings.push('Ignoring invalid heading — using 0.');
      }
      anchorOverride = {
        latDeg: lat,
        lonDeg: lon,
        headingDeg: heading === undefined ? 0 : normalizeHeading(heading),
      };
    }
  }

  const stackRaw = params.get('stack');
  let stack: StackName | undefined;
  if (stackRaw !== null) {
    if ((STACK_NAMES as readonly string[]).includes(stackRaw)) {
      stack = stackRaw as StackName;
    } else {
      warnings.push(`Ignoring unknown stack "${stackRaw}".`);
    }
  }

  const viewRaw = params.get('view');
  let view: ViewName | undefined;
  if (viewRaw !== null) {
    if ((VIEW_NAMES as readonly string[]).includes(viewRaw)) {
      view = viewRaw as ViewName;
    } else {
      warnings.push(`Ignoring unknown view "${viewRaw}".`);
    }
  }

  const test = params.get('test') === '1';

  return {
    ...(anchorOverride === undefined ? {} : { anchorOverride }),
    ...(stack === undefined ? {} : { stack }),
    ...(view === undefined ? {} : { view }),
    test,
    warnings,
  };
}

export function serializeUrlState(state: UrlStateInput): string {
  const params = new URLSearchParams();
  if (state.anchorOverride !== undefined) {
    params.set('lat', state.anchorOverride.latDeg.toFixed(7));
    params.set('lon', state.anchorOverride.lonDeg.toFixed(7));
    params.set('heading', state.anchorOverride.headingDeg.toFixed(2));
  }
  if (state.stack !== undefined) {
    params.set('stack', state.stack);
  }
  if (state.view !== undefined) {
    params.set('view', state.view);
  }
  if (state.test === true) {
    params.set('test', '1');
  }
  return params.toString();
}
