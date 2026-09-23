import { describe, expect, it } from 'vitest';

import { parseUrlState, serializeUrlState } from '../src/site/urlState.js';

describe('parseUrlState persistence params', () => {
  it('treats an empty ?api= as an explicit "no API" override without a warning', () => {
    const state = parseUrlState('?api=');
    expect(state.api).toBe('');
    expect(state.warnings).toEqual([]);
  });

  it('keeps only the origin of a valid ?api= override', () => {
    expect(parseUrlState('?api=https://api.example.test/path?x=1').api).toBe('https://api.example.test');
  });

  it('warns and ignores an invalid ?api= override', () => {
    const state = parseUrlState('?api=not-a-url');
    expect(state.api).toBeUndefined();
    expect(state.warnings).toHaveLength(1);
  });

  it('parses scene, numeric v, share and latest', () => {
    const state = parseUrlState('?scene=scn_abc&v=3&share=tok');
    expect(state.scene).toBe('scn_abc');
    expect(state.version).toBe(3);
    expect(state.share).toBe('tok');
    expect(parseUrlState('?scene=scn_abc&v=latest').version).toBe('latest');
  });

  it('warns on an invalid v', () => {
    const state = parseUrlState('?v=0');
    expect(state.version).toBeUndefined();
    expect(state.warnings).toHaveLength(1);
  });

  it('round-trips scene, version, share and api', () => {
    const search = serializeUrlState({ scene: 'scn_abc', version: 2, share: 'tok', api: '' });
    const params = new URLSearchParams(search);
    expect(params.get('scene')).toBe('scn_abc');
    expect(params.get('v')).toBe('2');
    expect(params.get('share')).toBe('tok');
    expect(params.get('api')).toBe('');
  });
});
