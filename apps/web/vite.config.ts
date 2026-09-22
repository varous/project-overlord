import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

import { defineConfig } from 'vitest/config';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const require = createRequire(import.meta.url);

// The Cesium package is hoisted to the workspace root by npm workspaces, so resolve it
// through node's resolver rather than assuming a path under apps/web/node_modules.
const cesiumSource = resolve(dirname(require.resolve('cesium/package.json')), 'Build/Cesium');
const cesiumBaseUrl = 'cesium';

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
        { src: `${cesiumSource}/Workers/**/*`, dest: `${cesiumBaseUrl}/Workers` },
        { src: `${cesiumSource}/Assets/**/*`, dest: `${cesiumBaseUrl}/Assets` },
        { src: `${cesiumSource}/ThirdParty/**/*`, dest: `${cesiumBaseUrl}/ThirdParty` },
        { src: `${cesiumSource}/Widgets/**/*`, dest: `${cesiumBaseUrl}/Widgets` },
      ],
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
