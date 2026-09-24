import { describe, expect, it } from 'vitest';

import { elementTypeRegistry, loadElementTypeRegistry } from '../src/index.js';

function makeType(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const defaultSize = { x: ['10', 'ft'], y: ['10', 'ft'], z: ['4', 'ft'] };
  return {
    code: 'A_TYPE',
    name: 'A type',
    category: 'STAGE',
    geometry: 'BOX',
    defaultSize,
    minSize: { x: ['2', 'ft'], y: ['2', 'ft'], z: ['1', 'ft'] },
    maxSize: { x: ['20', 'ft'], y: ['20', 'ft'], z: ['8', 'ft'] },
    defaultCount: 1,
    color: '#000000',
    source: 'test',
    aliases: [],
    sizePresets: [{ label: 'Default', size: defaultSize, source: 'test' }],
    paramSpec: [],
    regionTags: ['kolkata'],
    eventTypeTags: ['concert'],
    offeringMappings: [],
    ...overrides,
  };
}

const ALL_CODES = [
  'MAIN_STAGE', 'CONSOLE_RISER', 'GREEN_ROOM', 'STOCK_ROOM', 'PRODUCTION_ROOM', 'CCTV_ROOM',
  'FOOD_STALL', 'COUPON_COUNTER', 'VVIP_PLATFORM', 'PAGODA', 'PYRO_PIT', 'RISER', 'AUDIENCE_AREA',
  'TOILET_BLOCK', 'ENTRY_GATE', 'FRISKING_BOOTH', 'BOX_OFFICE', 'BAR_COUNTER', 'MERCH_STALL',
  'GENERATOR', 'LED_WALL', 'DELAY_TOWER', 'AMBULANCE_BAY', 'PARKING_AREA', 'STORE_ROOM',
  'LIGHTING_TOWER', 'HYDRATION_COUNTER', 'FOOD_PREP', 'FIRST_AID_TENT', 'BAR_STORAGE',
  'SMOKING_ZONE', 'SPONSOR_ACTIVATION', 'VVIP_TABLE_PLATFORM', 'VVIP_TABLE', 'HOSPITALITY_PLATFORM',
  'TURNSTILE', 'DFMD', 'TOILET_VAN', 'URINAL_BANK', 'WASHROOM_BLOCK', 'FIRE_ENGINE_BAY',
  'OPS_ROOM', 'CREW_DINING',
  'MASKING_WALL', 'MOJO_BARRICADE', 'TIN_BARRICADE', 'METAL_RAILING', 'FIRE_LANE',
];

describe('element-type registry', () => {
  it('seeds every required type with empty offeringMappings', () => {
    expect(elementTypeRegistry.size).toBe(48);
    for (const code of ALL_CODES) {
      const definition = elementTypeRegistry.get(code);
      expect(definition, code).toBeDefined();
      expect(definition?.offeringMappings).toEqual([]);
    }
  });

  it('validates every seeded type (presets contain the default, LINEAR has no size)', () => {
    for (const definition of elementTypeRegistry.values()) {
      if (definition.geometry === 'LINEAR') {
        expect(definition.linear, definition.code).not.toBeNull();
        expect(definition.sizePresets, definition.code).toEqual([]);
        continue;
      }
      expect(definition.sizePresets.length, definition.code).toBeGreaterThan(0);
      const hasDefault = definition.sizePresets.some(
        (preset) =>
          preset.size.x === definition.defaultSize.x &&
          preset.size.y === definition.defaultSize.y &&
          preset.size.z === definition.defaultSize.z,
      );
      expect(hasDefault, definition.code).toBe(true);
      if (definition.geometry === 'FLAT') {
        expect(definition.defaultSize.z, definition.code).toBe(0);
        expect(definition.minSize.z, definition.code).toBe(0);
        expect(definition.maxSize.z, definition.code).toBe(0);
      }
    }
  });

  it('has exactly five LINEAR types with a linear block', () => {
    const linear = [...elementTypeRegistry.values()].filter((d) => d.geometry === 'LINEAR');
    expect(linear.map((d) => d.code).sort()).toEqual(
      ['FIRE_LANE', 'MASKING_WALL', 'METAL_RAILING', 'MOJO_BARRICADE', 'TIN_BARRICADE'],
    );
    for (const definition of linear) {
      expect(definition.linear?.segmentLength).toBeGreaterThan(0);
      expect(definition.linear?.defaultWidth).toBeGreaterThan(0);
      expect(['RFT', 'RM']).toContain(definition.linear?.unit);
    }
  });

  it('has unique aliases across the whole registry', () => {
    const seen = new Map<string, string>();
    for (const definition of elementTypeRegistry.values()) {
      for (const alias of definition.aliases) {
        expect(seen.has(alias), `${alias} (${definition.code})`).toBe(false);
        seen.set(alias, definition.code);
      }
    }
    expect(elementTypeRegistry.get('MOJO_BARRICADE')?.aliases).toContain('mojo');
    expect(elementTypeRegistry.get('DFMD')?.aliases).toContain('metal detector');
  });

  it('records the corpus and Aquatica corrections', () => {
    expect(elementTypeRegistry.get('MAIN_STAGE')?.defaultSize).toEqual({ x: 182880, y: 121920, z: 18288 });
    expect(elementTypeRegistry.get('GREEN_ROOM')?.defaultCount).toBe(4);
    expect(elementTypeRegistry.get('AUDIENCE_AREA')?.geometry).toBe('FLAT');
    // PAGODA is now the Aquatica 5 x 5 m, keeping 16 x 16 ft as a preset.
    expect(elementTypeRegistry.get('PAGODA')?.defaultSize).toEqual({
      x: 50000,
      y: 50000,
      z: 30480,
    });
    expect(elementTypeRegistry.get('PAGODA')?.sizePresets.map((p) => p.label)).toEqual([
      '5 x 5 m x 10 ft',
      '16 x 16 x 10 ft',
    ]);
    expect(elementTypeRegistry.get('BOX_OFFICE')?.defaultSize).toEqual({ x: 50000, y: 50000, z: 30480 });
    expect(elementTypeRegistry.get('DELAY_TOWER')?.defaultSize).toEqual({ x: 20000, y: 20000, z: 18288 });
    expect(elementTypeRegistry.get('GENERATOR')?.defaultSize).toEqual({ x: 48768, y: 15240, z: 24384 });
    expect(elementTypeRegistry.get('BAR_COUNTER')?.sizePresets).toHaveLength(5);
    expect(elementTypeRegistry.get('BAR_COUNTER')?.paramSpec[0]?.values).toEqual(['12', '16', '24', '28', '40']);
  });

  it('rejects duplicate codes', () => {
    const raw = { types: [makeType(), makeType()] };
    expect(() => loadElementTypeRegistry(raw)).toThrow(/duplicate/);
  });

  it('rejects duplicate aliases across types', () => {
    const raw = {
      types: [makeType({ code: 'A', aliases: ['shared'] }), makeType({ code: 'B', aliases: ['shared'] })],
    };
    expect(() => loadElementTypeRegistry(raw)).toThrow(/alias "shared"/);
  });

  it('rejects an alias with punctuation or upper case', () => {
    expect(() => loadElementTypeRegistry({ types: [makeType({ aliases: ['Bar-Counter'] })] })).toThrow(
      /lower-case with no punctuation/,
    );
  });

  it('rejects a defaultSize that is not one of the presets', () => {
    const raw = {
      types: [
        makeType({
          sizePresets: [
            { label: 'Other', size: { x: ['9', 'ft'], y: ['9', 'ft'], z: ['3', 'ft'] }, source: 's' },
          ],
        }),
      ],
    };
    expect(() => loadElementTypeRegistry(raw)).toThrow(/defaultSize must equal one sizePreset/);
  });

  it('rejects min > default, default > max, FLAT z != 0 and bad pairs', () => {
    expect(() =>
      loadElementTypeRegistry({
        types: [makeType({ minSize: { x: ['100', 'ft'], y: ['2', 'ft'], z: ['1', 'ft'] } })],
      }),
    ).toThrow(/min <= default <= max/);
    expect(() =>
      loadElementTypeRegistry({
        types: [makeType({ maxSize: { x: ['1', 'ft'], y: ['20', 'ft'], z: ['8', 'ft'] } })],
      }),
    ).toThrow(/min <= default <= max/);
    expect(() =>
      loadElementTypeRegistry({
        types: [
          makeType({
            code: 'FLAT_TYPE',
            geometry: 'FLAT',
            defaultSize: { x: ['10', 'ft'], y: ['10', 'ft'], z: ['1', 'ft'] },
            sizePresets: [
              { label: 'Default', size: { x: ['10', 'ft'], y: ['10', 'ft'], z: ['1', 'ft'] }, source: 's' },
            ],
          }),
        ],
      }),
    ).toThrow(/FLAT/);
    expect(() =>
      loadElementTypeRegistry({
        types: [makeType({ defaultSize: { x: '10ft', y: ['10', 'ft'], z: ['4', 'ft'] } })],
      }),
    ).toThrow(/\[decimalString, unit\]/);
  });

  it('rejects a LINEAR type that carries a size', () => {
    const raw = {
      types: [
        makeType({
          code: 'LINEAR_TYPE',
          geometry: 'LINEAR',
          linear: { segmentLength: ['1', 'm'], defaultWidth: ['1', 'm'], unit: 'RFT' },
          sizePresets: [],
        }),
      ],
    };
    expect(() => loadElementTypeRegistry(raw)).toThrow(/must not carry defaultSize/);
  });

  it('rejects a BOX type carrying a linear block', () => {
    const raw = {
      types: [makeType({ linear: { segmentLength: ['1', 'm'], defaultWidth: ['1', 'm'], unit: 'RFT' } })],
    };
    expect(() => loadElementTypeRegistry(raw)).toThrow(/linear is only allowed for LINEAR/);
  });

  it('rejects offeringMappings that are not an array', () => {
    expect(() => loadElementTypeRegistry({ types: [makeType({ offeringMappings: 'none' })] })).toThrow(
      /offeringMappings/,
    );
  });
});
