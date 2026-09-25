import { mkdtempSync, writeFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain ESM script, not part of the TS project
import { assertNoRateKeys, makeRateFreeBundle } from "../make-rate-free-bundle.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

function item(over = {}) {
  return {
    code: "TEST_X", name: "Test item", category: "test", section: "POWER", unit: "nos",
    qty_basis: "COUNT", day_curve: "FULL", tags: [], linked_rate_item: null,
    power_supply_kva: null, notes: null, sort_order: 1, placement: "PACKAGE_ONLY",
    ...over,
  };
}

/** A synthetic source bundle, in a temp dir outside the repo. `overrides.rates` replaces rates.json. */
function makeSource(overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), "sp-source-"));
  const items = overrides.items ?? [
    item({ code: "TEST_GENSET", name: "Generator", unit: "nos" }),
    item({
      code: "TEST_FUEL", name: "Fuel", unit: "l/hr",
      qty_basis: "CONSUMPTION_PER_HOUR", reference_rate: false,
    }),
    item({
      code: "TEST_DIESEL", name: "Diesel", unit: "litre",
      qty_basis: "RATE_PER_LITRE", reference_rate: true,
    }),
  ];
  const packageItems = overrides.packageItems ?? [
    { package_id: "PKG_TEST", item_code: "TEST_GENSET", qty_rule: "FIXED", qty_value: 1, flag: "MANDATORY" },
    { package_id: "PKG_TEST", item_code: "TEST_FUEL", qty_rule: "FIXED", qty_value: 1, flag: "MANDATORY" },
    { package_id: "PKG_TEST", item_code: "TEST_DIESEL", qty_rule: "FIXED", qty_value: 1, flag: "MANDATORY" },
  ];
  const rates = overrides.rates ?? [
    { item_code: "TEST_FUEL", side: "CLIENT", city: null, rate: 12 },
    { item_code: "TEST_FUEL", side: "VENDOR", city: null, rate: 12 },
    { item_code: "TEST_DIESEL", side: "CLIENT", city: null, rate: 110 },
  ];
  writeFileSync(join(dir, "items.json"), JSON.stringify(items));
  writeFileSync(join(dir, "packages.json"), JSON.stringify([{ package_id: "PKG_TEST", name: "Kit", params: [] }]));
  writeFileSync(join(dir, "package_items.json"), JSON.stringify(packageItems));
  writeFileSync(join(dir, "day_curves.json"), JSON.stringify({ FULL: { "1": 1, "2": 2 } }));
  writeFileSync(join(dir, "VERSION"), "test_v1\n");
  if (overrides.omitRates !== true) writeFileSync(join(dir, "rates.json"), JSON.stringify(rates));
  return dir;
}

function outDir() {
  return mkdtempSync(join(tmpdir(), "sp-out-"));
}

describe("make-rate-free-bundle", () => {
  it("lifts consumption (litres/hour) onto the CONSUMPTION_PER_HOUR item", () => {
    const out = join(outDir(), "bundle");
    makeRateFreeBundle(makeSource(), out);
    const items = JSON.parse(readFileSync(join(out, "items.json"), "utf8"));
    const fuel = items.find((i) => i.code === "TEST_FUEL");
    expect(fuel.consumption_litres_per_hour).toBe(12);
  });

  it("drops RATE_PER_LITRE items and every package_item that references them", () => {
    const out = join(outDir(), "bundle");
    const r = makeRateFreeBundle(makeSource(), out);
    expect(r.droppedCodes).toEqual(["TEST_DIESEL"]);
    expect(r.itemsIn).toBe(3);
    expect(r.itemsOut).toBe(2);
    expect(r.packageItemsIn).toBe(3);
    expect(r.packageItemsOut).toBe(2);
    const items = JSON.parse(readFileSync(join(out, "items.json"), "utf8"));
    expect(items.map((i) => i.code).sort()).toEqual(["TEST_FUEL", "TEST_GENSET"]);
    const packageItems = JSON.parse(readFileSync(join(out, "package_items.json"), "utf8"));
    expect(packageItems.some((pi) => pi.item_code === "TEST_DIESEL")).toBe(false);
  });

  it("writes no rate/price/paise/amount key and no rates.json", () => {
    const out = join(outDir(), "bundle");
    makeRateFreeBundle(makeSource(), out);
    expect(existsSync(join(out, "rates.json"))).toBe(false);
    for (const file of readdirSync(out)) {
      if (file.endsWith(".json")) {
        expect(() => assertNoRateKeys(JSON.parse(readFileSync(join(out, file), "utf8")))).not.toThrow();
      }
    }
    /* reference_rate is gone; linked_rate_item is the sanctioned opaque key. */
    const items = JSON.parse(readFileSync(join(out, "items.json"), "utf8"));
    for (const i of items) expect("reference_rate" in i).toBe(false);
  });

  it("refuses to write inside the git working tree", () => {
    const out = join(repoRoot, ".rate-free-should-not-exist");
    expect(() => makeRateFreeBundle(makeSource(), out, { repoRoot })).toThrow(/write inside/);
    expect(existsSync(out)).toBe(false);
  });

  it("refuses to read a source inside the git working tree", () => {
    expect(() =>
      makeRateFreeBundle(join(repoRoot, "scripts"), outDir(), { repoRoot }),
    ).toThrow(/read a source inside/);
  });

  it("fails loudly when CLIENT and VENDOR consumption disagree", () => {
    const source = makeSource({
      rates: [
        { item_code: "TEST_FUEL", side: "CLIENT", city: null, rate: 12 },
        { item_code: "TEST_FUEL", side: "VENDOR", city: null, rate: 13 },
      ],
    });
    expect(() => makeRateFreeBundle(source, outDir())).toThrow(/disagree/);
  });

  it("fails loudly when a consumption row is missing", () => {
    const source = makeSource({ omitRates: true });
    expect(() => makeRateFreeBundle(source, outDir())).toThrow(/no rates\.json row/);
  });
});
