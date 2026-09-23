import { describe, expect, it } from 'vitest';

import { newSceneId, newShareToken } from '../src/ids.js';

describe('newSceneId', () => {
  it('returns "scn_" + 20 lowercase base32 chars', () => {
    for (let i = 0; i < 100; i += 1) {
      expect(newSceneId()).toMatch(/^scn_[a-z2-7]{20}$/);
    }
  });

  it('is unique across many draws', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newSceneId()));
    expect(ids.size).toBe(1000);
  });
});

describe('newShareToken', () => {
  it('returns 32 url-safe characters', () => {
    for (let i = 0; i < 100; i += 1) {
      const token = newShareToken();
      expect(token).toHaveLength(32);
      expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    }
  });

  it('is unique across many draws', () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => newShareToken()));
    expect(tokens.size).toBe(1000);
  });
});
