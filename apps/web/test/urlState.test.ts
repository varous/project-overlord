import { describe, expect, it } from 'vitest';

import { normalizeHeading, parseUrlState, serializeUrlState } from '../src/site/urlState.js';

describe('parseUrlState', () => {
  it('parses a full valid input', () => {
    const state = parseUrlState('?lat=22.55&lon=88.34&heading=90&stack=OSM&view=FOH&test=1');
    expect(state.anchorOverride).toEqual({ latDeg: 22.55, lonDeg: 88.34, headingDeg: 90 });
    expect(state.stack).toBe('OSM');
    expect(state.view).toBe('FOH');
    expect(state.test).toBe(true);
    expect(state.warnings).toEqual([]);
  });

  it('accepts a search string without a leading question mark', () => {
    const state = parseUrlState('lat=-33.9&lon=151.2');
    expect(state.anchorOverride).toEqual({ latDeg: -33.9, lonDeg: 151.2, headingDeg: 0 });
  });

  it('defaults heading to 0 and test to false when absent', () => {
    const state = parseUrlState('?lat=22.55&lon=88.34');
    expect(state.anchorOverride?.headingDeg).toBe(0);
    expect(state.test).toBe(false);
  });

  it('warns and ignores the anchor when only one of lat/lon is present', () => {
    const state = parseUrlState('?lat=22.55');
    expect(state.anchorOverride).toBeUndefined();
    expect(state.warnings).toHaveLength(1);
  });

  it('warns and ignores the anchor when lat is out of range', () => {
    const state = parseUrlState('?lat=999&lon=88');
    expect(state.anchorOverride).toBeUndefined();
    expect(state.warnings).toHaveLength(1);
  });

  it('warns and ignores the anchor when lon is out of range', () => {
    const state = parseUrlState('?lat=22&lon=999');
    expect(state.anchorOverride).toBeUndefined();
    expect(state.warnings).toHaveLength(1);
  });

  it('warns and ignores the anchor when lat/lon are not numbers', () => {
    const state = parseUrlState('?lat=abc&lon=88');
    expect(state.anchorOverride).toBeUndefined();
    expect(state.warnings).toHaveLength(1);
  });

  it('warns and ignores an unknown stack', () => {
    const state = parseUrlState('?stack=BING');
    expect(state.stack).toBeUndefined();
    expect(state.warnings).toHaveLength(1);
  });

  it('warns and ignores an unknown view', () => {
    const state = parseUrlState('?view=Orbit');
    expect(state.view).toBeUndefined();
    expect(state.warnings).toHaveLength(1);
  });

  it('warns and ignores an invalid heading but keeps the anchor', () => {
    const state = parseUrlState('?lat=22&lon=88&heading=abc');
    expect(state.anchorOverride).toEqual({ latDeg: 22, lonDeg: 88, headingDeg: 0 });
    expect(state.warnings).toHaveLength(1);
  });

  it('treats test=1 exactly', () => {
    expect(parseUrlState('?test=1').test).toBe(true);
    expect(parseUrlState('?test=true').test).toBe(false);
    expect(parseUrlState('?test=0').test).toBe(false);
  });
});

describe('normalizeHeading', () => {
  it('normalises negative and large headings', () => {
    expect(normalizeHeading(-90)).toBe(270);
    expect(normalizeHeading(450)).toBe(90);
    expect(normalizeHeading(0)).toBe(0);
    expect(normalizeHeading(360)).toBe(0);
    expect(normalizeHeading(-33.5)).toBeCloseTo(326.5, 10);
  });

  it('normalises overrides in parseUrlState', () => {
    expect(parseUrlState('?lat=1&lon=1&heading=-90').anchorOverride?.headingDeg).toBe(270);
    expect(parseUrlState('?lat=1&lon=1&heading=450').anchorOverride?.headingDeg).toBe(90);
  });
});

describe('serializeUrlState', () => {
  it('formats lat/lon with 7 decimals and heading with 2', () => {
    const search = serializeUrlState({
      anchorOverride: { latDeg: 22.5579, lonDeg: 88.3439, headingDeg: 90 },
      stack: 'ESRI',
      view: 'Aerial',
      test: true,
    });
    expect(search).toContain('lat=22.5579000');
    expect(search).toContain('lon=88.3439000');
    expect(search).toContain('heading=90.00');
    expect(search).toContain('stack=ESRI');
    expect(search).toContain('view=Aerial');
    expect(search).toContain('test=1');
  });

  it('round trips through parseUrlState', () => {
    const original = {
      anchorOverride: { latDeg: 22.5579, lonDeg: 88.3439, headingDeg: 270 },
      stack: 'OSM' as const,
      view: 'Stage' as const,
      test: true,
    };
    const parsed = parseUrlState(`?${serializeUrlState(original)}`);
    expect(parsed.anchorOverride).toEqual(original.anchorOverride);
    expect(parsed.stack).toBe(original.stack);
    expect(parsed.view).toBe(original.view);
    expect(parsed.test).toBe(true);
    expect(parsed.warnings).toEqual([]);
  });

  it('omits absent fields', () => {
    expect(serializeUrlState({})).toBe('');
    expect(serializeUrlState({ test: false })).toBe('');
  });
});
