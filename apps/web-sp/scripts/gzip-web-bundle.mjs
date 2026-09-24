#!/usr/bin/env node
/**
 * Gzipped size of the shipped web JS+CSS (source maps and the pdf.js worker
 * excluded). The app loads over venue Wi-Fi on a live client call; growth
 * must show up in `npm run status`, not after a failed demo.
 *
 *   node scripts/gzip-web-bundle.mjs
 *
 * Ceiling is the number below. 400,000 B is the one-time ADR-007 budget for
 * the whole headless-UI set — do not bump it per primitive. A rise above
 * 400,000 is a design conversation, not a PR-body one-liner.
 *
 * Why 400,000 (not 320,000): Radix's first primitive carries shared
 * infrastructure — portal, popper, focus scope, dismissable layer — that
 * DropdownMenu, ContextMenu, Dialog, Popover and Tooltip all reuse, so the
 * marginal cost of later primitives is small. Projected total once every
 * ADR-007 library is imported is ~380–395 KB gzip. 400,000 B is ~2s of
 * transfer on 1.5 Mbps venue Wi-Fi, on a cold cache, which happens about
 * once per salesperson per day.
 */
import { gzipSync } from "node:zlib";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const DIST = join(ROOT, "packages/web/dist");

/** Bytes of gzip -9 over JS/CSS, excluding pdf.worker and source maps. */
export const WEB_BUNDLE_GZIP_CEILING = 400_000;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

export function measureWebBundleGzip(dist = DIST) {
  if (!existsSync(dist)) {
    return { ok: false, bytes: 0, files: [], error: `no dist at ${dist} — run the web build first` };
  }
  const files = [];
  let bytes = 0;
  for (const p of walk(dist)) {
    const base = p.slice(dist.length + 1);
    if (base.endsWith(".map")) continue;
    if (!/\.(js|mjs|css)$/.test(base)) continue;
    if (/pdf\.worker/i.test(base)) continue;
    const buf = readFileSync(p);
    const gz = gzipSync(buf, { level: 9 }).length;
    files.push({ file: base, gzip: gz, raw: buf.length });
    bytes += gz;
  }
  files.sort((a, b) => b.gzip - a.gzip);
  return { ok: true, bytes, files, error: null };
}

const measured = measureWebBundleGzip();
if (!measured.ok) {
  console.error(measured.error);
  process.exit(1);
}
const over = measured.bytes > WEB_BUNDLE_GZIP_CEILING;
const fmt = (n) => `${n.toLocaleString("en-IN")} B (${(n / 1024).toFixed(1)} KiB)`;
console.log(`web JS+CSS gzip: ${fmt(measured.bytes)}  ceiling ${fmt(WEB_BUNDLE_GZIP_CEILING)}`);
for (const f of measured.files) {
  console.log(`  ${String(f.gzip).padStart(7)}  ${f.file}`);
}
if (over) {
  console.error(
    `web bundle gzip ${measured.bytes} exceeds ceiling ${WEB_BUNDLE_GZIP_CEILING}. ` +
      `400,000 B is the ADR-007 budget. A rise above it is a design conversation, not a silent bump.`,
  );
  process.exit(1);
}
