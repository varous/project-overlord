import { describe, expect, it } from 'vitest';

import { bearerToken, isAuthorized } from '../src/auth.js';

describe('bearerToken', () => {
  it('extracts the token after "Bearer "', () => {
    expect(bearerToken('Bearer abc')).toBe('abc');
  });

  it('returns null for missing or malformed headers', () => {
    expect(bearerToken(undefined)).toBeNull();
    expect(bearerToken('abc')).toBeNull();
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken('')).toBeNull();
  });
});

describe('isAuthorized', () => {
  it('accepts the exact token', () => {
    expect(isAuthorized('Bearer secret-token', 'secret-token')).toBe(true);
  });

  it('rejects a wrong token', () => {
    expect(isAuthorized('Bearer wrong', 'secret-token')).toBe(false);
  });

  it('rejects a missing or malformed header', () => {
    expect(isAuthorized(undefined, 'secret-token')).toBe(false);
    expect(isAuthorized('secret-token', 'secret-token')).toBe(false);
  });
});
