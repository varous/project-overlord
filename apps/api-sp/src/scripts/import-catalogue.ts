/**
 * Import a catalogue bundle. Idempotent by code — run it as often as you like.
 *
 *   npm run import:catalogue -- ./bundle           # local (tsx)
 *   … --dry-run                                    # validate only, write nothing
 *
 * The contract: "re-importing a newer export upserts items / curves / packages."
 * So this UPSERTS by primary key and never deletes an item — `items.code` is a
 * foreign key across the whole system. An item that vanishes from the sheet is
 * reported, not removed.
 *
 * No rates are imported: money belongs to QuoteOS. Fuel consumption is a
 * physical property on the item row.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { loadBundle, type Bundle, type Finding } from "@overlord/boq";
import { writeCatalogue } from "../lib/import-catalogue.js";

const db = new PrismaClient();

function read<T>(dir: string, file: string): T {
  const p = path.join(dir, file);
  if (!existsSync(p)) throw new Error(`Bundle is missing ${file} (looked in ${dir})`);
  return JSON.parse(readFileSync(p, "utf8")) as T;
}

function summarise(findings: readonly Finding[]): void {
  const bySeverity = { error: 0, warning: 0, info: 0 };
  const byCode = new Map<string, number>();
  for (const f of findings) {
    bySeverity[f.severity]++;
    byCode.set(f.code, (byCode.get(f.code) ?? 0) + 1);
  }
  console.log(
    `\n[validate] ${bySeverity.error} errors · ${bySeverity.warning} warnings · ${bySeverity.info} info`,
  );
  for (const [code, n] of [...byCode].sort((a, b) => b[1] - a[1])) {
    console.log(`           ${String(n).padStart(4)}  ${code}`);
  }
  for (const f of findings.filter((x) => x.severity === "error").slice(0, 20)) {
    console.log(`   ERROR  ${f.itemCode ?? f.packageId ?? ""} ${f.message}`);
  }
}

async function main(): Promise<void> {
  const dir = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");
  if (!dir) {
    console.error("usage: import-catalogue <bundle-dir> [--dry-run]");
    process.exit(2);
  }

  const bundle: Bundle = {
    items: read(dir, "items.json"),
    day_curves: read(dir, "day_curves.json"),
    packages: read(dir, "packages.json"),
    package_items: read(dir, "package_items.json"),
  };

  const versionFile = path.join(dir, "VERSION");
  const label = existsSync(versionFile)
    ? readFileSync(versionFile, "utf8").trim()
    : `import_${new Date().toISOString().slice(0, 10)}`;

  console.log(`[import] bundle=${dir} version=${label}${dryRun ? " (DRY RUN)" : ""}`);

  const { catalogue, findings } = loadBundle(bundle, label);
  summarise(findings);

  const errors = findings.filter((f) => f.severity === "error");
  if (errors.length > 0) {
    console.error(
      `\n[import] ABORTED — ${errors.length} error-level findings. ` +
        `Fix the master sheet and regenerate; nothing was written.`,
    );
    process.exit(1);
  }
  if (dryRun) {
    console.log("\n[import] dry run complete. Nothing written.");
    return;
  }

  const written = await writeCatalogue(db, catalogue, findings, label);
  console.log(
    `\n[import] done. ${written.items} items · ` +
      `${written.curves} curves · ${written.packages} packages · version ${written.version}`,
  );
}

const invoked = process.argv[1] && path.basename(process.argv[1]).startsWith("import-catalogue");
if (invoked) {
  main()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => void db.$disconnect());
}
