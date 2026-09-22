import { describe, expect, it } from 'vitest';
import { sourced, type Sourced } from '../src/index.js';

describe('sourced', () => {
  it('wraps a value with its provenance', () => {
    expect(sourced(42, 'STATED')).toEqual({ value: 42, provenance: 'STATED' });
  });

  it('carries an optional note', () => {
    expect(sourced('8 m truss', 'MEASURED', 'laser disto')).toEqual({
      value: '8 m truss',
      provenance: 'MEASURED',
      note: 'laser disto',
    });
  });

  it('omits the note key when not provided', () => {
    const result: Sourced<number> = sourced(1, 'INFERRED');
    expect('note' in result).toBe(false);
  });

  it('preserves every provenance tag', () => {
    const tags = ['STATED', 'ARCHETYPE', 'MEASURED', 'INFERRED'] as const;
    for (const tag of tags) {
      expect(sourced(null, tag).provenance).toBe(tag);
    }
  });
});
