import { describe, expect, it } from 'vitest';

import { renderQualityFor } from '../src/viewer/renderQuality.js';

describe('renderQualityFor', () => {
  it('bounds quality in test mode', () => {
    expect(renderQualityFor(true)).toEqual({
      maximumLevel: 17,
      globeMaximumScreenSpaceError: 4,
    });
  });

  it('uses Cesium/service defaults in normal use', () => {
    expect(renderQualityFor(false)).toEqual({
      maximumLevel: null,
      globeMaximumScreenSpaceError: null,
    });
  });
});
