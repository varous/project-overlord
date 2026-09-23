/**
 * Shared bearer-token authentication. The comparison is timing-safe: both sides are hashed to a
 * fixed length before comparison so the token length and content never leak through timing.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

export function bearerToken(header: string | undefined): string | null {
  if (header === undefined) {
    return null;
  }
  if (!header.startsWith('Bearer ')) {
    return null;
  }
  return header.slice('Bearer '.length);
}

export function isAuthorized(header: string | undefined, expectedToken: string): boolean {
  const provided = bearerToken(header);
  if (provided === null) {
    return false;
  }
  const providedDigest = createHash('sha256').update(provided).digest();
  const expectedDigest = createHash('sha256').update(expectedToken).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}
