#!/usr/bin/env node
/**
 * Section / curve wording — one term per concept (AGENTS.md glossary).
 *
 * Codes (`VC` | `OPS` | `POWER`) are data identifiers. Human sentences use
 * Venue Construction | Operations | Power. This check fails the variants that
 * have already been written by accident: "venue build", "VC section", "V.C.",
 * "VC+OPS+POWER". It does not try to enforce title-case on every sentence —
 * that is not cheap (false positives on keys, seed, and `if (curve === "VC")`).
 *
 * AGENTS.md is skipped so the glossary can name the forbidden forms.
 *
 *   node scripts/qa-section-terms.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");

const FORBIDDEN = [
  [/venue build/i, 'use "Venue Construction"'],
  [/venue-build/i, 'use "Venue Construction"'],
  [/\bV\.C\./, 'use `VC` (code) or "Venue Construction" (prose)'],
  [/\bVC section\b/, 'use "Venue Construction"'],
  [/\bOPS section\b/, 'use "Operations"'],
  [/\bPOWER section\b/, 'use "Power"'],
  [/VC\s*\+\s*OPS\s*\+\s*POWER/, 'use "Venue Construction, Operations and Power"'],
];

const SKIP_DIR = new Set([
  "node_modules",
  "dist",
  ".git",
  "seed",
  "icons",
]);
const SKIP_FILE = new Set([
  "AGENTS.md",
  "qa-section-terms.mjs",
]);

const ROOTS = ["docs", "packages/domain/src", "packages/domain/test", "packages/api/src", "packages/web/src", ".cursor/rules"];
const ROOT_FILES = ["CLAUDE.md", "design-inventions.md"];

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIR.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(md|mdc|ts|tsx|mjs|js)$/.test(name) && !SKIP_FILE.has(name)) out.push(p);
  }
  return out;
}

const files = [
  ...ROOTS.flatMap((d) => walk(join(ROOT, d))),
  ...ROOT_FILES.map((f) => join(ROOT, f)),
];

const hits = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const rel = relative(ROOT, file);
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    for (const [re, why] of FORBIDDEN) {
      if (re.test(line)) hits.push(`${rel}:${i + 1}: ${why}\n  ${line.trim()}`);
    }
  }
}

if (hits.length) {
  console.error(`section terms: ${hits.length} unapproved variant(s)\n`);
  console.error(hits.join("\n\n"));
  process.exit(1);
}
console.log(`section terms: ok (${files.length} files)`);
