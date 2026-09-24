#!/usr/bin/env node
// Acceptance-gate guard for the Cloudflare Pages build.
// Fails if the web build is incomplete or exceeds Cloudflare Pages limits.
//
// Cesium assets live in a build-scoped directory (cesium-<build id>); this script locates it by
// prefix (never a literal path) and asserts the base URL baked into the built JS matches it.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_FILE_BYTES = 25 * 1024 * 1024; // Cloudflare Pages per-file limit
const MAX_FILES = 20000; // Cloudflare Pages file-count limit

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distArgIndex = process.argv.indexOf('--dist');
const distDir = resolve(
  repoRoot,
  distArgIndex >= 0 ? process.argv[distArgIndex + 1] : 'apps/web/dist',
);

let failed = false;
function fail(message) {
  console.error(`check-web-build: FAIL — ${message}`);
  failed = true;
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
if (existsSync(distDir) && statSync(distDir).isDirectory()) {
  files = walk(distDir);
} else {
  fail(`${relative(repoRoot, distDir)} does not exist`);
}

// The Cesium directory is found by prefix, then cross-checked against the built JS.
const cesiumDirs = readdirSync(distDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith('cesium-'))
  .map((entry) => entry.name);

let cesiumDir = null;
if (cesiumDirs.length !== 1) {
  fail(`expected exactly one cesium-<build id> directory, found ${cesiumDirs.length}`);
} else {
  cesiumDir = cesiumDirs[0];
}

if (cesiumDir !== null) {
  const requiredPaths = [
    'index.html',
    `${cesiumDir}/Workers/createTaskProcessorWorker.js`,
    `${cesiumDir}/Workers/createVerticesFromHeightmap.js`,
    `${cesiumDir}/Assets/approximateTerrainHeights.json`,
    `${cesiumDir}/Widgets/widgets.css`,
    `${cesiumDir}/ThirdParty/Workers`,
  ];
  for (const relativePath of requiredPaths) {
    if (!existsSync(join(distDir, relativePath))) {
      fail(`apps/web/dist/${relativePath} is missing`);
    }
  }

  const entryAssets = files.filter((file) => /assets[\\/]index-.*\.js$/.test(file));
  if (entryAssets.length !== 1) {
    fail(`expected exactly one assets/index-*.js entry point, found ${entryAssets.length}`);
  } else {
    const entry = entryAssets[0];
    const text = readFileSync(entry, 'utf8');
    if (!text.includes(`/${cesiumDir}/`)) {
      fail(`the built JS does not reference /${cesiumDir}/ (CESIUM_BASE_URL mismatch)`);
    }
  }
}

// The cache headers must scope immutable to the build-scoped Cesium directory and /assets/*.
const headersPath = join(distDir, '_headers');
if (!existsSync(headersPath)) {
  fail('apps/web/dist/_headers is missing');
} else {
  const headers = readFileSync(headersPath, 'utf8');
  if (!headers.includes('/cesium-*/*')) {
    fail('_headers must apply the immutable cache to /cesium-*/*');
  }
  if (!headers.includes('/assets/*')) {
    fail('_headers must apply the immutable cache to /assets/*');
  }
  if (!headers.includes('/index.html') || !/index\.html[\s\S]*no-cache/.test(headers)) {
    fail('_headers must keep /index.html no-cache');
  }
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
  `check-web-build: OK — ${files.length} files, cesium dir ${cesiumDir}, largest ${mib(largest.size)} MiB (${relative(repoRoot, largest.file)})`,
);
