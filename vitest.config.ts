import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Playwright specs live in e2e/ and must not be picked up by vitest.
    // The ShowPlan-lineage workspace tests run with their own configs:
    //   npm run test -w @overlord/boq | @overlord/api-sp | @overlord/web-sp
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'e2e/**',
      'apps/api-sp/**',
      'apps/web-sp/**',
      'packages/boq/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
});
