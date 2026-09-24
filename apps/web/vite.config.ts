import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

import { defineConfig } from 'vitest/config';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const require = createRequire(import.meta.url);

// The Cesium package is hoisted to the workspace root by npm workspaces, so resolve it
// through node's resolver rather than assuming a path under apps/web/node_modules.
const cesiumSource = resolve(dirname(require.resolve('cesium/package.json')), 'Build/Cesium');

// Cesium's static assets are published under a BUILD-SCOPED directory (/cesium-<build id>/), and
// CESIUM_BASE_URL is set to match. A previously poisoned cache entry (an old build served HTML from
// /cesium/* during Tasks 002-003) can then never be replayed, because the URL changes every build.
// A directory is used, never a query string: Cesium concatenates worker URLs as strings.
const buildId = (
  process.env.VITE_BUILD_ID ??
  process.env.GITHUB_SHA ??
  process.env.VITE_COMMIT_SHA ??
  String(Date.now())
).slice(0, 12);
const cesiumBaseUrl = `cesium-${buildId}`;

// vite-plugin-static-copy v4 always preserves the matched path relative to the Vite root, which
// for this hoisted install is `node_modules/cesium/Build/Cesium/<dir>`. Stripping those four
// leading segments lands files at /<cesiumBaseUrl>/<dir>/... exactly where CESIUM_BASE_URL expects.
const STRIP_SEGMENTS = 4;
const stripBase = { stripBase: STRIP_SEGMENTS } as const;

export default defineConfig({
  base: '/',
  define: {
    CESIUM_BASE_URL: JSON.stringify(`/${cesiumBaseUrl}/`),
  },
  server: {
    port: 5173,
  },
  plugins: [
    viteStaticCopy({
      targets: [
        { src: `${cesiumSource}/Workers/**/*`, dest: cesiumBaseUrl, rename: stripBase },
        { src: `${cesiumSource}/Assets/**/*`, dest: cesiumBaseUrl, rename: stripBase },
        { src: `${cesiumSource}/ThirdParty/**/*`, dest: cesiumBaseUrl, rename: stripBase },
        { src: `${cesiumSource}/Widgets/**/*`, dest: cesiumBaseUrl, rename: stripBase },
      ],
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
