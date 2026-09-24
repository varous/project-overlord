/**
 * A synthetic catalogue bundle for tests.
 *
 * ShowPlan's tests ran against the real 217-item seed, which is not in this
 * repo and never will be (it carries rates). This fixture is entirely invented:
 * codes are prefixed TEST_, every name is a generic word, and no real CAV code,
 * item name or rate appears anywhere.
 *
 * Between them the rows cover:
 *   every QtyBasis        AREA | LENGTH | VOLUME | COUNT | COUNT_PER_DAY | CONSUMPTION_PER_HOUR
 *   every QtyRuleKind     FIXED | PER_AREA | PER_LENGTH | PER_COUNT_PARAM | PER_FRONT_FACE | PER_VOLUME
 *   every Placement       CANVAS | SHOW | PACKAGE_ONLY
 *   every flag            MANDATORY | DEFAULT_ON | OPTIONAL
 *   a PER_COUNT_PARAM     `counters` (and `lanes` in a second kit)
 *   a genset package      PACKAGE_ONLY hire + PACKAGE_ONLY fuel via consumptionLitresPerHour
 */

import { loadBundle, type Bundle } from "../../src/load.js";
import type { Catalogue } from "../../src/catalog.js";
import type { Finding } from "../../src/findings.js";

function linearCurve(): Record<string, number> {
  const table: Record<string, number> = {};
  for (let d = 1; d <= 14; d++) table[String(d)] = d;
  return table;
}

function flatCurve(): Record<string, number> {
  const table: Record<string, number> = {};
  for (let d = 1; d <= 14; d++) table[String(d)] = 1;
  return table;
}

export const SYNTHETIC_BUNDLE: Bundle = {
  day_curves: {
    FULL: linearCurve(),
    ONCE: flatCurve(),
  },
  items: [
    {
      code: "TEST_PLATFORM", name: "Platform deck", category: "structure", section: "VC",
      unit: "sqft", qty_basis: "AREA", day_curve: "FULL", tags: ["platform", "deck"],
      linked_rate_item: null, power_supply_kva: null, notes: null, sort_order: 1,
      placement: "CANVAS",
    },
    {
      code: "TEST_SCAFFOLD", name: "Scaffold stack", category: "structure", section: "VC",
      unit: "cbm", qty_basis: "VOLUME", day_curve: "FULL", tags: ["scaffold", "stack"],
      linked_rate_item: null, power_supply_kva: null, notes: null, sort_order: 2,
      placement: "CANVAS",
    },
    {
      code: "TEST_RAIL", name: "Handrail run", category: "structure", section: "VC",
      unit: "rft", qty_basis: "LENGTH", day_curve: "FULL", tags: ["rail", "run"],
      linked_rate_item: null, power_supply_kva: null, notes: null, sort_order: 3,
      placement: "CANVAS",
    },
    {
      code: "TEST_CABLE", name: "Cable run", category: "power", section: "OPS",
      unit: "rft", qty_basis: "LENGTH", day_curve: "FULL", tags: ["cable", "run"],
      linked_rate_item: null, power_supply_kva: null, notes: null, sort_order: 4,
      placement: "CANVAS",
    },
    {
      code: "TEST_CHAIR", name: "Stacking chair", category: "furniture", section: "OPS",
      unit: "nos", qty_basis: "COUNT", day_curve: "FULL", tags: ["chair", "seat"],
      linked_rate_item: null, power_supply_kva: null, notes: null, sort_order: 5,
      placement: "CANVAS",
    },
    {
      code: "TEST_LIGHT", name: "Wash fixture", category: "lighting", section: "POWER",
      unit: "nos", qty_basis: "COUNT", day_curve: "FULL", tags: ["light", "wash"],
      linked_rate_item: null, power_supply_kva: 0.2, notes: null, sort_order: 6,
      placement: "CANVAS",
    },
    {
      code: "TEST_PLUG", name: "Floor socket", category: "power", section: "POWER",
      unit: "nos", qty_basis: "COUNT", day_curve: "FULL", tags: ["socket", "floor"],
      linked_rate_item: null, power_supply_kva: null, notes: null, sort_order: 7,
      placement: "CANVAS",
    },
    {
      code: "TEST_LED", name: "LED strip", category: "lighting", section: "POWER",
      unit: "nos", qty_basis: "COUNT", day_curve: "FULL", tags: ["led", "strip"],
      linked_rate_item: null, power_supply_kva: null, notes: null, sort_order: 8,
      placement: "CANVAS",
    },
    {
      /* Front-face masking: the auto package must use PER_FRONT_FACE, like the kit. */
      code: "TEST_FASCIA", name: "Fascia panel", category: "masking", section: "VC",
      unit: "sqft", qty_basis: "AREA", day_curve: "FULL", tags: ["fascia", "mask"],
      linked_rate_item: null, power_supply_kva: null, notes: null, sort_order: 9,
      placement: "CANVAS", auto_qty_rule: "PER_FRONT_FACE:height_ft",
    },
    {
      code: "TEST_PEST", name: "Pest control visit", category: "services", section: "OPS",
      unit: "nos", qty_basis: "COUNT", day_curve: "ONCE", tags: ["pest", "service"],
      linked_rate_item: null, power_supply_kva: null, notes: null, sort_order: 10,
      placement: "SHOW",
    },
    {
      code: "TEST_CREW", name: "Crew day", category: "services", section: "OPS",
      unit: "nos/duty", qty_basis: "COUNT_PER_DAY", day_curve: "ONCE", tags: ["crew", "day"],
      linked_rate_item: null, power_supply_kva: null, notes: null, sort_order: 11,
      placement: "SHOW",
    },
    {
      /* Kit-only hire: must live inside a package, never placed standalone. */
      code: "TEST_GENSET", name: "Generator unit", category: "power", section: "POWER",
      unit: "nos", qty_basis: "COUNT", day_curve: "FULL", tags: ["genset", "hire"],
      linked_rate_item: null, power_supply_kva: 60, notes: null, sort_order: 12,
      placement: "PACKAGE_ONLY",
    },
    {
      /* Kit-only fuel: litres per running hour is physics, carried on the row. */
      code: "TEST_GENFUEL", name: "Generator fuel", category: "power", section: "POWER",
      unit: "l/hr", qty_basis: "CONSUMPTION_PER_HOUR", day_curve: "FULL", tags: ["fuel"],
      linked_rate_item: null, consumption_litres_per_hour: 12,
      power_supply_kva: null, notes: null, sort_order: 13,
      placement: "PACKAGE_ONLY",
    },
  ],
  packages: [
    { package_id: "PKG_TEST_STAGE", name: "Test stage kit", params: ["width_ft", "depth_ft", "counters", "height_ft"] },
    { package_id: "PKG_TEST_LIGHTING", name: "Test lighting kit", params: ["lanes"] },
    { package_id: "PKG_TEST_GENSET", name: "Test genset kit", params: [] },
  ],
  package_items: [
    /* MANDATORY + DEFAULT_ON + OPTIONAL; PER_AREA, PER_LENGTH, PER_COUNT_PARAM, PER_VOLUME, PER_FRONT_FACE, FIXED. */
    { package_id: "PKG_TEST_STAGE", item_code: "TEST_PLATFORM", qty_rule: "PER_AREA", qty_value: 1, flag: "MANDATORY" },
    { package_id: "PKG_TEST_STAGE", item_code: "TEST_PLUG", qty_rule: "PER_COUNT_PARAM:counters", qty_value: 1, flag: "MANDATORY" },
    { package_id: "PKG_TEST_STAGE", item_code: "TEST_RAIL", qty_rule: "PER_LENGTH", qty_value: 2, flag: "DEFAULT_ON" },
    { package_id: "PKG_TEST_STAGE", item_code: "TEST_FASCIA", qty_rule: "PER_FRONT_FACE:height_ft", qty_value: 1, flag: "DEFAULT_ON" },
    { package_id: "PKG_TEST_STAGE", item_code: "TEST_SCAFFOLD", qty_rule: "PER_VOLUME:height_ft", qty_value: 1, flag: "OPTIONAL" },

    { package_id: "PKG_TEST_LIGHTING", item_code: "TEST_LIGHT", qty_rule: "PER_COUNT_PARAM:lanes", qty_value: 1, flag: "MANDATORY" },
    { package_id: "PKG_TEST_LIGHTING", item_code: "TEST_LED", qty_rule: "FIXED", qty_value: 2, flag: "DEFAULT_ON" },

    { package_id: "PKG_TEST_GENSET", item_code: "TEST_GENSET", qty_rule: "FIXED", qty_value: 1, flag: "MANDATORY" },
    { package_id: "PKG_TEST_GENSET", item_code: "TEST_GENFUEL", qty_rule: "FIXED", qty_value: 1, flag: "MANDATORY" },
  ],
};

export const SYNTHETIC_VERSION = "synthetic_test_v1";

export function loadSynthetic(version: string = SYNTHETIC_VERSION): {
  catalogue: Catalogue;
  findings: Finding[];
} {
  return loadBundle(SYNTHETIC_BUNDLE, version);
}
