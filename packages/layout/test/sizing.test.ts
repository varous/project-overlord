import { describe, expect, it } from 'vitest';

import {
  AUDIENCE_DENSITY_DEFAULT,
  SIZING_RULES,
  audienceAreaM2,
  findSizingRule,
  sizingCount,
  sizingReason,
} from '../src/sizing.js';

describe('sizing rules', () => {
  it('exposes every rule with a source string', () => {
    expect(SIZING_RULES.length).toBeGreaterThanOrEqual(7);
    for (const rule of SIZING_RULES) {
      expect(rule.source).toContain('provisional');
      expect(rule.perPeople).toBeGreaterThan(0);
    }
  });

  it('counts one per perPeople with a minimum, deterministically', () => {
    const toilets = findSizingRule('toiletBlocks');
    expect(toilets).not.toBeNull();
    if (toilets === null) {
      return;
    }
    expect(sizingCount(toilets, 5000)).toBe(7); // ceil(5000/750)
    expect(sizingCount(toilets, 100)).toBe(1); // min
  });

  it('computes the audience area from capacity and density', () => {
    expect(audienceAreaM2(5000, AUDIENCE_DENSITY_DEFAULT)).toBe(2000);
  });

  it('cites the rule source in plain English (never a compliance claim)', () => {
    const rule = findSizingRule('foodStalls');
    expect(rule).not.toBeNull();
    if (rule === null) {
      return;
    }
    const reason = sizingReason(rule, 5);
    expect(reason).toContain('food stalls');
    expect(reason).toContain('provisional');
    expect(reason.toLowerCase()).not.toContain('compliant');
  });
});
