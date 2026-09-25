#!/usr/bin/env node
/**
 * Build a rate-free catalogue bundle from a ShowPlan-format source directory.
 *
 *   node scripts/make-rate-free-bundle.mjs <sourceDir> <outDir>
 *
 * The source is a ShowPlan bundle: items.json, packages.json, package_items.json,
 * day_curves.json, VERSION, and (usually) rates.json. The real one contains
 * CLIENT and VENDOR rates. This repo is public, so NO rate value may reach it —
 * not even in git history. This script is the boundary: it reads the private
 * source and writes a bundle that carries only physics (fuel consumption) and
 * opaque join keys.
 *
 * It refuses to read from or write to anywhere inside this git working tree.
 * Produce the output somewhere like ~/scratch and import it; never commit it.
 *
 * Rules:
 *  - CONSUMPTION_PER_HOUR items get `consumption_litres_per_hour` from their
 *    rates.json row (for those items only, the `rate` column holds litres/hour).
 *    A missing row, or CLIENT/VENDOR disagreement, is a hard failure.
 *  - RATE_PER_LITRE items are dropped, along with every package_item referencing
 *    them.
 *  - `reference_rate` is dropped from every item.
 *  - `linked_rate_item` is kept verbatim as an opaque QuoteOS join key.
 *  - rates.json is never written, and a post-write scan fails if any
 *    rate/price/paise/amount key (other than `linked_rate_item`) appears.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

/** Keys that must never appear in the output, apart from the sanctioned join key. */
const FORBIDDEN_KEY = /rate|price|paise|amount/i;
const ALLOWED_KEY = new Set(["linked_rate_item"]);

function isInside(child, parent) {
  const c = resolve(child);
  const p = resolve(parent);
  return c === p || c.startsWith(p + sep);
}

function readJson(dir, file, { required }) {
  const p = join(dir, file);
  if (!existsSync(p)) {
    if (required) throw new Error(`source bundle is missing ${file} (looked in ${dir})`);
    return null;
  }
  return JSON.parse(readFileSync(p, "utf8"));
}

/**
 * Recursively fail if a forbidden key appears in a JSON value.
 * `linked_rate_item` is the one exception: it is an opaque join key with no value.
 */
export function assertNoRateKeys(value, path = "$") {
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoRateKeys(v, `${path}[${i}]`));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, v] of Object.entries(value)) {
      const here = `${path}.${key}`;
      if (FORBIDDEN_KEY.test(key) && !ALLOWED_KEY.has(key)) {
        throw new Error(`forbidden key "${key}" at ${here}`);
      }
      assertNoRateKeys(v, here);
    }
  }
}

/**
 * Resolve the litres-per-hour for every CONSUMPTION_PER_HOUR item from the
 * source rates. Missing or side-disagreeing rows fail loudly.
 */
function liftConsumption(items, rates) {
  const byItem = new Map();
  for (const r of rates) {
    const list = byItem.get(r.item_code) ?? [];
    list.push(r);
    byItem.set(r.item_code, list);
  }

  const lifted = new Map();
  for (const item of items) {
    if (item.qty_basis !== "CONSUMPTION_PER_HOUR") continue;
    const rows = byItem.get(item.code) ?? [];
    if (rows.length === 0) {
      throw new Error(`CONSUMPTION_PER_HOUR item ${item.code} has no rates.json row`);
    }
    const client = rows.filter((r) => r.side === "CLIENT").map((r) => r.rate);
    const vendor = rows.filter((r) => r.side === "VENDOR").map((r) => r.rate);
    const values = new Set([...client, ...vendor]);
    if (values.size === 0) {
      throw new Error(`CONSUMPTION_PER_HOUR item ${item.code} has rate rows but no values`);
    }
    if (client.length > 0 && vendor.length > 0) {
      const c = new Set(client);
      const v = new Set(vendor);
      const same = c.size === 1 && v.size === 1 && [...c][0] === [...v][0];
      if (!same) {
        throw new Error(
          `consumption for ${item.code} disagrees between CLIENT (${[...c].join(", ")}) ` +
            `and VENDOR (${[...v].join(", ")}); consumption is physics and must be one value`,
        );
      }
    }
    if (values.size > 1) {
      throw new Error(`consumption for ${item.code} has differing values (${[...values].join(", ")})`);
    }
    lifted.set(item.code, [...values][0]);
  }
  return lifted;
}

export function makeRateFreeBundle(sourceDir, outDir, opts = {}) {
  const repoRoot = opts.repoRoot ?? REPO_ROOT;
  if (isInside(sourceDir, repoRoot)) {
    throw new Error(`refusing to read a source inside the git working tree: ${resolve(sourceDir)}`);
  }
  if (isInside(outDir, repoRoot)) {
    throw new Error(`refusing to write inside the git working tree: ${resolve(outDir)}`);
  }

  const rawItems = readJson(sourceDir, "items.json", { required: true });
  const packages = readJson(sourceDir, "packages.json", { required: true });
  const packageItems = readJson(sourceDir, "package_items.json", { required: true });
  const dayCurves = readJson(sourceDir, "day_curves.json", { required: true });
  const versionFile = join(sourceDir, "VERSION");
  const version = existsSync(versionFile) ? readFileSync(versionFile, "utf8").trim() : null;
  const rates = readJson(sourceDir, "rates.json", { required: false }) ?? [];

  const itemsIn = rawItems.length;

  const droppedCodes = new Set(
    rawItems.filter((i) => i.qty_basis === "RATE_PER_LITRE").map((i) => i.code),
  );
  const consumption = liftConsumption(rawItems, rates);

  const items = [];
  for (const item of rawItems) {
    if (droppedCodes.has(item.code)) continue;
    const { reference_rate: _drop, ...rest } = item;
    if (consumption.has(item.code)) {
      rest.consumption_litres_per_hour = consumption.get(item.code);
    }
    items.push(rest);
  }

  const survivingCodes = new Set(items.map((i) => i.code));
  const packageItemsOut = packageItems.filter((pi) => survivingCodes.has(pi.item_code));
  const packageItemsDropped = packageItems.length - packageItemsOut.length;

  const out = {
    items,
    packages,
    package_items: packageItemsOut,
    day_curves: dayCurves,
  };

  for (const [key, value] of Object.entries(out)) assertNoRateKeys(value, `$.${key}`);

  mkdirSync(outDir, { recursive: true });
  for (const [key, value] of Object.entries(out)) {
    writeFileSync(join(outDir, `${key}.json`), `${JSON.stringify(value, null, 2)}\n`);
  }
  if (version !== null) writeFileSync(join(outDir, "VERSION"), `${version}\n`);

  /* Re-read everything we wrote and scan once more — belt and braces. */
  for (const file of readdirSync(outDir)) {
    if (!file.endsWith(".json")) continue;
    assertNoRateKeys(JSON.parse(readFileSync(join(outDir, file), "utf8")), `$.${file}`);
  }
  if (existsSync(join(outDir, "rates.json"))) {
    throw new Error("rates.json was written — refusing");
  }

  return {
    sourceDir: resolve(sourceDir),
    outDir: resolve(outDir),
    itemsIn,
    itemsOut: items.length,
    packages: packages.length,
    packageItemsIn: packageItems.length,
    packageItemsOut: packageItemsOut.length,
    packageItemsDropped,
    droppedCodes: [...droppedCodes].sort(),
    consumptionLifted: [...consumption.entries()].sort(([a], [b]) => a.localeCompare(b)),
    version,
  };
}

function main(argv) {
  const [sourceDir, outDir] = argv;
  if (!sourceDir || !outDir) {
    console.error("usage: make-rate-free-bundle.mjs <sourceDir> <outDir>");
    return 2;
  }
  const s = statSync(sourceDir, { throwIfNoEntry: false });
  if (!s || !s.isDirectory()) {
    console.error(`source directory not found: ${sourceDir}`);
    return 2;
  }
  const r = makeRateFreeBundle(sourceDir, outDir);
  console.log(`[rate-free] source=${r.sourceDir}`);
  console.log(`[rate-free] out=${r.outDir}`);
  console.log(`[rate-free] items: ${r.itemsIn} in -> ${r.itemsOut} out`);
  console.log(`[rate-free] packages: ${r.packages}`);
  console.log(
    `[rate-free] package_items: ${r.packageItemsIn} in -> ${r.packageItemsOut} out ` +
      `(${r.packageItemsDropped} dropped with removed items)`,
  );
  console.log(`[rate-free] dropped codes (${r.droppedCodes.length}): ${r.droppedCodes.join(", ") || "none"}`);
  console.log(
    `[rate-free] consumption lifted (${r.consumptionLifted.length}): ` +
      (r.consumptionLifted.map(([c, v]) => `${c}=${v} l/hr`).join(", ") || "none"),
  );
  if (r.version) console.log(`[rate-free] version: ${r.version}`);
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    console.error(`[rate-free] FAIL: ${error.message}`);
    process.exit(1);
  }
}
