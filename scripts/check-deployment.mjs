#!/usr/bin/env node
// Verify a DEPLOYED site, not just the local build. make verify only checks apps/web/dist, so a
// deployment whose /cesium-* files are missing would still pass and the globe would render as an
// outline with no tiles.
//
// Usage: node scripts/check-deployment.mjs <url> [--dist apps/web/dist]
// Retries each URL up to 5 times (5s apart) because a fresh deployment takes a moment to be live.
import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const urlArg = process.argv[2];
if (urlArg === undefined) {
  console.error('usage: check-deployment.mjs <url> [--dist <dir>]');
  process.exit(2);
}
const distArgIndex = process.argv.indexOf('--dist');
const distDir = resolve(
  repoRoot,
  distArgIndex >= 0 ? process.argv[distArgIndex + 1] : 'apps/web/dist',
);
const base = urlArg.replace(/\/+$/, '');
const ATTEMPTS = Number(process.env.DEPLOY_CHECK_ATTEMPTS ?? 5);
const RETRY_WAIT_MS = 5000;

/** The ShowPlan editor (overlord-editor). Optional: skipped until its secrets exist. */
const editorUrl = (process.env.EDITOR_URL ?? '').replace(/\/+$/, '');

function isJs(contentType) {
  return /javascript|ecmascript/i.test(contentType ?? '');
}
function isCss(contentType) {
  return /text\/css/i.test(contentType ?? '');
}
function isHtml(contentType) {
  return /text\/html/i.test(contentType ?? '');
}
function isJson(contentType) {
  return /json/i.test(contentType ?? '');
}

/** The Cesium directory name as the local artifact used it (never hardcoded). */
function cesiumDirFromDist() {
  if (!existsSync(distDir)) {
    return null;
  }
  const dirs = readdirSync(distDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('cesium-'))
    .map((entry) => entry.name);
  return dirs.length === 1 ? dirs[0] : null;
}

function record(status, contentType, path) {
  console.log(`  ${String(status).padEnd(4)} ${(contentType ?? '-').padEnd(28)} ${path}`);
}

async function checkOnce(cesiumDir) {
  const fail = (message) => {
    throw new Error(message);
  };

  const indexResponse = await fetch(`${base}/`, { redirect: 'follow' });
  record(indexResponse.status, indexResponse.headers.get('content-type'), 'GET /');
  if (indexResponse.status !== 200) {
    fail('GET / did not return 200');
  }
  if (!isHtml(indexResponse.headers.get('content-type'))) {
    fail('GET / did not return text/html');
  }
  const html = await indexResponse.text();
  const match = html.match(/\/assets\/index-[A-Za-z0-9._-]+\.js/);
  if (match === null) {
    fail('could not find /assets/index-*.js in index.html');
  }
  const entryPath = match[0];

  const jsResponse = await fetch(`${base}${entryPath}`);
  const jsContentType = jsResponse.headers.get('content-type');
  record(jsResponse.status, jsContentType, `GET ${entryPath}`);
  if (jsResponse.status !== 200) {
    fail('the entry JS did not return 200');
  }
  if (!isJs(jsContentType)) {
    fail('the entry JS did not return a JavaScript content type (an SPA fallback returned HTML?)');
  }
  const jsText = await jsResponse.text();

  let dir = cesiumDir;
  if (dir === null) {
    const found = jsText.match(/\/cesium-[A-Za-z0-9_-]+\//);
    if (found === null) {
      fail('could not find the build-scoped cesium-* base URL in the entry JS');
    }
    dir = found[0].replaceAll('/', '');
  } else if (!jsText.includes(`/${dir}/`)) {
    fail(`the entry JS does not reference /${dir}/ (CESIUM_BASE_URL mismatch)`);
  }
  console.log(`  cesium directory: ${dir}`);

  const assets = [
    [`/${dir}/Workers/createVerticesFromHeightmap.js`, isJs, 'JavaScript'],
    [`/${dir}/Workers/transferTypedArrayTest.js`, isJs, 'JavaScript'],
    [`/${dir}/Widgets/widgets.css`, isCss, 'text/css'],
    [`/${dir}/Assets/approximateTerrainHeights.json`, isJson, 'JSON'],
  ];
  for (const [path, predicate, label] of assets) {
    const response = await fetch(`${base}${path}`);
    const contentType = response.headers.get('content-type');
    record(response.status, contentType, `GET ${path}`);
    if (response.status !== 200) {
      fail(`GET ${path} did not return 200`);
    }
    if (!predicate(contentType)) {
      fail(`GET ${path} did not return a ${label} content type`);
    }
  }

  // The SPA fallback may return index.html for a missing path; that is fine. What must NOT happen
  // is a missing asset coming back as JavaScript or CSS (that is the poisoned-cache failure mode).
  const missingPath = `/does-not-exist-${Math.random().toString(36).slice(2, 10)}`;
  const missingResponse = await fetch(`${base}${missingPath}`);
  const missingContentType = missingResponse.headers.get('content-type');
  record(missingResponse.status, missingContentType, `GET ${missingPath}`);
  if (isJs(missingContentType) || isCss(missingContentType)) {
    fail(`the SPA fallback returned ${missingContentType} for a missing asset`);
  }
}

/**
 * The ShowPlan editor is checked only when EDITOR_URL is set, so this gate does
 * not fail before the Render service and its secrets exist.
 */
async function checkEditor() {
  const health = await fetch(`${editorUrl}/healthz`, { redirect: 'follow' });
  record(health.status, health.headers.get('content-type'), `GET ${editorUrl}/healthz`);
  if (health.status !== 200) {
    throw new Error('editor GET /healthz did not return 200');
  }
  const root = await fetch(`${editorUrl}/`, { redirect: 'follow' });
  record(root.status, root.headers.get('content-type'), `GET ${editorUrl}/`);
  if (root.status !== 200) {
    throw new Error('editor GET / did not return 200');
  }
  if (!isHtml(root.headers.get('content-type'))) {
    throw new Error('editor GET / did not return text/html');
  }
  const html = await root.text();
  if (!html.includes('id="root"')) {
    throw new Error('editor GET / did not contain the web-sp app root (id="root")');
  }
}

async function checkEditorWithRetries() {
  if (editorUrl === '') {
    console.log('check-deployment: EDITOR_URL not set — skipping the editor check.');
    return;
  }
  let lastEditorError = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      await checkEditor();
      console.log(`check-deployment: editor OK — ${editorUrl}`);
      return;
    } catch (error) {
      lastEditorError = error;
      console.error(`check-deployment: editor attempt ${attempt} failed — ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_WAIT_MS));
    }
  }
  throw new Error(`editor check failed: ${lastEditorError?.message}`);
}

let lastError = null;
for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
  console.log(`check-deployment: ${base} (attempt ${attempt}/${ATTEMPTS})`);
  try {
    await new Promise((resolve) => setTimeout(resolve, RETRY_WAIT_MS));
    await checkOnce(cesiumDirFromDist());
    console.log(`check-deployment: OK — ${base}`);
    try {
      await checkEditorWithRetries();
    } catch (editorError) {
      console.error(`check-deployment: FAIL — ${editorError.message}`);
      process.exit(1);
    }
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.error(`check-deployment: attempt ${attempt} failed — ${error.message}`);
  }
}
console.error(`check-deployment: FAIL — ${base}: ${lastError?.message}`);
process.exit(1);
