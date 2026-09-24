import { afterEach, describe, expect, it, vi } from 'vitest';

import { sampleWithTimeout } from '../src/viewer/groundHeight.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('sampleWithTimeout', () => {
  it('resolves with the sampled height when the sampler wins', async () => {
    await expect(sampleWithTimeout(async () => 12.5, 5000)).resolves.toBe(12.5);
  });

  it('resolves null when the sample rejects', async () => {
    await expect(
      sampleWithTimeout(async () => {
        throw new Error('nope');
      }, 5000),
    ).resolves.toBeNull();
  });

  it('resolves null when the sampler exceeds the timeout', async () => {
    vi.useFakeTimers();
    const pending = sampleWithTimeout(() => new Promise<number | null>(() => undefined), 5000);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(pending).resolves.toBeNull();
  });

  it('does not wait for the timeout when the sampler resolves first', async () => {
    vi.useFakeTimers();
    const pending = sampleWithTimeout(async () => 7, 5000);
    await expect(pending).resolves.toBe(7);
    // No pending timers should remain.
    expect(vi.getTimerCount()).toBe(0);
  });
});
