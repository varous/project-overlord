import { describe, expect, it } from 'vitest';

import { formatBoth, formatTrimmed, parseValue } from '../src/ui/units.js';

describe('formatTrimmed', () => {
  it('trims trailing zeros and keeps the unit', () => {
    expect(formatTrimmed(182880 as never, 'ft')).toBe('60 ft');
    expect(formatTrimmed(18288 as never, 'ft')).toBe('6 ft');
    expect(formatTrimmed(182880 as never, 'm')).toBe('18.29 m');
  });
});

describe('formatBoth', () => {
  it('shows the chosen unit with the other in brackets', () => {
    expect(formatBoth(182880 as never, 'ft')).toBe('60 ft (18.29 m)');
    expect(formatBoth(182880 as never, 'm')).toBe('18.29 m (60 ft)');
  });
});

describe('parseValue', () => {
  it('parses feet and metres, allowing negatives and units', () => {
    expect(parseValue('60', 'ft')).toBe(182880);
    expect(parseValue('18.29', 'm')).toBe(182900);
    expect(parseValue('-8 ft', 'ft')).toBe(-24384);
    expect(parseValue('6m', 'm')).toBe(60000);
  });

  it('returns null for invalid input', () => {
    expect(parseValue('', 'ft')).toBeNull();
    expect(parseValue('abc', 'ft')).toBeNull();
    expect(parseValue('1.23456', 'm')).toBeNull();
  });
});
