import { describe, expect, it } from 'vitest';

import { elementTypeRegistry, loadElementTypeRegistry } from '../src/index.js';

function makeType(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    code: 'A_TYPE',
    name: 'A type',
    category: 'STAGE',
    geometry: 'BOX',
    defaultSize: { x: ['10', 'ft'], y: ['10', 'ft'], z: ['4', 'ft'] },
    minSize: { x: ['2', 'ft'], y: ['2', 'ft'], z: ['1', 'ft'] },
    maxSize: { x: ['20', 'ft'], y: ['20', 'ft'], z: ['8', 'ft'] },
    defaultCount: 1,
    color: '#000000',
    source: 'test',
    offeringMappings: [],
    ...overrides,
  };
}

describe('element-type registry', () => {
  it('seeds every required type with empty offeringMappings', () => {
    expect(elementTypeRegistry.size).toBe(25);
    for (const code of [
      'MAIN_STAGE',
      'CONSOLE_RISER',
      'GREEN_ROOM',
      'STOCK_ROOM',
      'PRODUCTION_ROOM',
      'CCTV_ROOM',
      'FOOD_STALL',
      'COUPON_COUNTER',
      'VVIP_PLATFORM',
      'PAGODA',
      'PYRO_PIT',
      'RISER',
      'AUDIENCE_AREA',
      'TOILET_BLOCK',
      'ENTRY_GATE',
      'FRISKING_BOOTH',
      'BOX_OFFICE',
      'BAR_COUNTER',
      'MERCH_STALL',
      'GENERATOR',
      'LED_WALL',
      'DELAY_TOWER',
      'AMBULANCE_BAY',
      'PARKING_AREA',
      'STORE_ROOM',
    ]) {
      const definition = elementTypeRegistry.get(code);
      expect(definition, code).toBeDefined();
      expect(definition?.offeringMappings).toEqual([]);
    }
  });

  it('records the corpus dominant sizes', () => {
    expect(elementTypeRegistry.get('MAIN_STAGE')?.defaultSize).toEqual({
      x: 182880,
      y: 121920,
      z: 18288,
    });
    expect(elementTypeRegistry.get('GREEN_ROOM')?.defaultCount).toBe(4);
    expect(elementTypeRegistry.get('AUDIENCE_AREA')?.geometry).toBe('FLAT');
  });

  it('rejects duplicate codes', () => {
    const raw = { types: [makeType(), makeType()] };
    expect(() => loadElementTypeRegistry(raw)).toThrow(/duplicate/);
  });

  it('rejects min > default', () => {
    const raw = {
      types: [makeType({ minSize: { x: ['100', 'ft'], y: ['2', 'ft'], z: ['1', 'ft'] } })],
    };
    expect(() => loadElementTypeRegistry(raw)).toThrow(/min <= default <= max/);
  });

  it('rejects default > max', () => {
    const raw = {
      types: [makeType({ maxSize: { x: ['1', 'ft'], y: ['20', 'ft'], z: ['8', 'ft'] } })],
    };
    expect(() => loadElementTypeRegistry(raw)).toThrow(/min <= default <= max/);
  });

  it('rejects a FLAT type with non-zero z', () => {
    const raw = {
      types: [
        makeType({
          code: 'FLAT_TYPE',
          geometry: 'FLAT',
          defaultSize: { x: ['10', 'ft'], y: ['10', 'ft'], z: ['1', 'ft'] },
          maxSize: { x: ['20', 'ft'], y: ['20', 'ft'], z: ['8', 'ft'] },
        }),
      ],
    };
    expect(() => loadElementTypeRegistry(raw)).toThrow(/FLAT/);
  });

  it('rejects offeringMappings that are not an array', () => {
    const raw = { types: [makeType({ offeringMappings: 'none' })] };
    expect(() => loadElementTypeRegistry(raw)).toThrow(/offeringMappings/);
  });

  it('rejects a bad size pair', () => {
    const raw = { types: [makeType({ defaultSize: { x: '10ft', y: ['10', 'ft'], z: ['4', 'ft'] } })] };
    expect(() => loadElementTypeRegistry(raw)).toThrow(/\[decimalString, unit\]/);
  });
});
