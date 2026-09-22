import { describe, expect, it } from 'vitest';

import { canonicalJson, contentHash, sha256Hex } from '../src/index.js';
import { makeScene } from './fixtures.js';

describe('canonicalJson', () => {
  it('sorts keys at every depth and emits no whitespace', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, 1] } })).toBe('{"a":{"c":[3,1],"d":2},"b":1}');
  });

  it('is stable across key insertion order', () => {
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });

  it('throws on undefined, NaN, Infinity, functions and bigint', () => {
    expect(() => canonicalJson({ a: undefined })).toThrow();
    expect(() => canonicalJson(Number.NaN)).toThrow();
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => canonicalJson({ f: () => 1 })).toThrow();
    expect(() => canonicalJson({ n: 1n })).toThrow();
  });
});

describe('sha256Hex', () => {
  it('matches the known vector for "abc"', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('contentHash', () => {
  it('does not change with key order', async () => {
    const a = makeScene();
    const b = makeScene();
    // Reinsert one element's keys in a different order.
    const element = b.elements[0];
    if (element !== undefined) {
      const reordered = {
        params: element.params,
        size: element.size,
        placement: element.placement,
        label: element.label,
        typeCode: element.typeCode,
        id: element.id,
      };
      b.elements[0] = reordered as typeof element;
    }
    expect(await contentHash(a)).toBe(await contentHash(b));
  });

  it('changes when any value changes', async () => {
    const a = makeScene();
    const b = makeScene();
    b.name = `${b.name} (edited)`;
    expect(await contentHash(a)).not.toBe(await contentHash(b));
  });
});
