import { describe, expect, it } from 'vitest';

import {
  WATCHDOG_MAX_FAILURES,
  WATCHDOG_WINDOW_MS,
  shouldFallBack,
} from '../src/viewer/imageryWatchdog.js';

describe('shouldFallBack', () => {
  it('falls back with 0 successes and 6 failures inside the window', () => {
    expect(shouldFallBack({ successes: 0, failures: 6, elapsedMs: 4000 })).toBe(true);
  });

  it('does not fall back with 6 failures but 1 success', () => {
    expect(shouldFallBack({ successes: 1, failures: 6, elapsedMs: 4000 })).toBe(false);
  });

  it('does not fall back when the failures spread past the window', () => {
    expect(shouldFallBack({ successes: 0, failures: 6, elapsedMs: 12_000 })).toBe(false);
  });

  it('does not fall back at or below the failure threshold', () => {
    expect(shouldFallBack({ successes: 0, failures: WATCHDOG_MAX_FAILURES, elapsedMs: 1000 })).toBe(false);
  });

  it('still falls back exactly at the window boundary', () => {
    expect(shouldFallBack({ successes: 0, failures: 6, elapsedMs: WATCHDOG_WINDOW_MS })).toBe(true);
  });
});
