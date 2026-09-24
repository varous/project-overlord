#!/usr/bin/env node
/**
 * QA-24 — enabled chrome with no handler.
 *
 * Fourth instance of the same class (app menus, Share, snaps, then these).
 * An IconButton or Button that can render enabled must have an onClick (or
 * be a submit). Reserved slots use `disabled={!caps.x}` — that is the QA-16
 * pattern and passes. A tag with neither `disabled` nor a handler is the lie.
 *
 * Static on the TSX, not Playwright: we need to see whether a handler exists,
 * and the DOM cannot tell a no-op button from a working one. Scoped to
 * `IconButton` / `Button` call sites (not primitives.tsx, where onClick is
 * forwarded). ToolChip/Select are a **known limit of this check** (QA-LOG
 * cycle 9): they always attach a handler inside the primitive, so a dead
 * call site still passes. Do not treat a green scan as coverage of those.
 *
 * ADR-007: Radix moves handlers to `onSelect` / `onValueChange` on different
 * parts. Item / CheckboxItem / RadioItem need `onSelect` (or `onCheckedChange`
 * / `onValueChange`) or `disabled`. Triggers open the menu — they do not need
 * onClick. Any PR that migrates a control MUST update this script in the same
 * PR, or the check goes green while seeing nothing. See
 * `.github/pull_request_template.md` and `docs/ENGINEERING-STANDARDS.md` §11.
 *
 *   node scripts/qa-no-handler.mjs
 *   node --test scripts/qa-no-handler.test.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = join(import.meta.dirname, "..");
const SRC = join(ROOT, "packages/web/src");
const SKIP = new Set(["primitives.tsx"]);

const BUTTON = /<(IconButton|Button)\b/g;
const RADIX_ITEM =
  /<(?:Menubar|DropdownMenu|ContextMenu)\.(Item|CheckboxItem|RadioItem)\b/g;
const TOGGLE_ROOT = /<ToggleGroup\.Root\b/g;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith(".tsx") && !SKIP.has(name)) out.push(p);
  }
  return out;
}

/** Opening tag starting at `<Name`, respecting `{...}` so `>` inside JSX expr is ignored. */
export function openingTag(src, start) {
  let i = start;
  let depth = 0;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    if (quote) {
      if (c === "\\" && quote !== "`") {
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      quote = c;
      i += 1;
      continue;
    }
    if (c === "{") {
      depth += 1;
      i += 1;
      continue;
    }
    if (c === "}") {
      depth = Math.max(0, depth - 1);
      i += 1;
      continue;
    }
    if (c === ">" && depth === 0) {
      return src.slice(start, i + 1);
    }
    i += 1;
  }
  return null;
}

function hasDisabled(tag) {
  return /\bdisabled\b/.test(tag);
}

function hasButtonHandler(tag) {
  return /\bonClick\b/.test(tag) || /\btype\s*=\s*["']submit["']/.test(tag);
}

function hasRadixItemHandler(tag) {
  return /\bon(Select|CheckedChange|ValueChange)\b/.test(tag);
}

function hasRadixRootHandler(tag) {
  return /\bon(ValueChange|CheckedChange)\b/.test(tag);
}

function collect(src, rel, re, handler) {
  const hits = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(src))) {
    const tag = openingTag(src, m.index);
    if (!tag) continue;
    if (!handler(tag) && !hasDisabled(tag)) {
      const line = src.slice(0, m.index).split("\n").length;
      const preview = tag.replace(/\s+/g, " ").slice(0, 120);
      hits.push(`${rel}:${line}: ${preview}`);
    }
  }
  return hits;
}

/** Scan one TSX source string. Exported so the unit test can feed a broken case. */
export function scanSource(src, rel = "fixture.tsx") {
  return [
    ...collect(src, rel, BUTTON, hasButtonHandler),
    ...collect(src, rel, RADIX_ITEM, hasRadixItemHandler),
    ...collect(src, rel, TOGGLE_ROOT, hasRadixRootHandler),
  ];
}

export function scanTree(srcRoot = SRC, root = ROOT) {
  const hits = [];
  for (const file of walk(srcRoot)) {
    hits.push(...scanSource(readFileSync(file, "utf8"), relative(root, file)));
  }
  return hits;
}

function isCli() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

if (isCli()) {
  const hits = scanTree();
  if (hits.length) {
    console.error(`QA-24: ${hits.length} enabled chrome with no handler:\n${hits.join("\n")}`);
    process.exit(1);
  }
  console.log(
    "QA-24: ok (every enabled IconButton/Button/Radix Item has a handler or is disabled)",
  );
}
