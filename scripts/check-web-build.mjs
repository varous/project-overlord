#!/usr/bin/env node
// Acceptance-gate guard for the Cloudflare Pages build.
// Fails if the web build is incomplete or exceeds Cloudflare Pages limits.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_FILE_BYTES = 25 * 1024 * 1024; // Cloudflare Pages per-file limit
const MAX_FILES = 20000; // Cloudflare Pages file-count limit

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = resolve(repoRoot, 'apps/web/dist');

let failed = false;
function fail(message) {
  console.error(`check-web-build: FAIL — ${message}`);
  failed = true;
}

const requiredPaths = [
  'index.html',
  'cesium/Workers/createTaskProcessorWorker.js',
  'cesium/Assets/approximateTerrainHeights.json',
  'cesium/Widgets/widgets.css',
  'cesium/ThirdParty/Workers',
];

for (const relativePath of requiredPaths) {
  if (!existsSync(join(distDir, relativePath))) {
    fail(`apps/web/dist/${relativePath} is missing`);
  }
}

function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...walk(full));
    } else if (entry.isFile()) {
      found.push(full);
    }
  }
  return found;
}

let files = [];
if (existsSync(distDir)) {
  files = walk(distDir);
}

const sizes = files.map((file) => ({ file, size: statSync(file).size }));
let largest = { file: '', size: 0 };
for (const entry of sizes) {
  if (entry.size > largest.size) {
    largest = entry;
  }
  if (entry.size > MAX_FILE_BYTES) {
    fail(`${relative(repoRoot, entry.file)} is ${entry.size} bytes (limit ${MAX_FILE_BYTES})`);
  }
}

if (files.length > MAX_FILES) {
  fail(`dist contains ${files.length} files (limit ${MAX_FILES})`);
}

if (failed) {
  process.exit(1);
}

const mib = (bytes) => (bytes / (1024 * 1024)).toFixed(2);
console.log(
  `check-web-build: OK — ${files.length} files, largest ${mib(largest.size)} MiB (${relative(repoRoot, largest.file)})`,
);
