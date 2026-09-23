import { describe, expect, it } from 'vitest';

import { formatRelativeTime } from '../src/ui/relativeTime.js';

const NOW = Date.parse('2026-09-23T12:00:00.000Z');

describe('formatRelativeTime', () => {
  it('formats recent, minutes, hours, days, months and years', () => {
    expect(formatRelativeTime('2026-09-23T11:59:50.000Z', NOW)).toBe('just now');
    expect(formatRelativeTime('2026-09-23T11:30:00.000Z', NOW)).toBe('30 min ago');
    expect(formatRelativeTime('2026-09-23T09:00:00.000Z', NOW)).toBe('3 hr ago');
    expect(formatRelativeTime('2026-09-21T12:00:00.000Z', NOW)).toBe('2 days ago');
    expect(formatRelativeTime('2026-08-24T12:00:00.000Z', NOW)).toBe('1 month ago');
    expect(formatRelativeTime('2024-09-23T12:00:00.000Z', NOW)).toBe('2 years ago');
  });

  it('returns "unknown" for an unparseable timestamp', () => {
    expect(formatRelativeTime('not-a-date', NOW)).toBe('unknown');
  });
});
