/**
 * Server-side id generation. Scene ids and share tokens are opaque and unpredictable.
 */

import { randomBytes, randomUUID } from 'node:crypto';

const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

/**
 * "scn_" + 20 lowercase base32 chars, derived from crypto.randomUUID's 16 bytes
 * (128 bits → 26 base32 chars, truncated to 20). Charset is [a-z2-7], a subset of [a-z0-9].
 */
export function newSceneId(): string {
  const hex = randomUUID().replace(/-/g, '');
  const bytes = Buffer.from(hex, 'hex');

  let buffer = 0;
  let bits = 0;
  let output = '';
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  }

  return `scn_${output.slice(0, 20)}`;
}

/** 32 url-safe random chars: 24 random bytes → 32 base64url chars, no padding. */
export function newShareToken(): string {
  return randomBytes(24).toString('base64url');
}
