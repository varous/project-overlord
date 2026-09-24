import tseslint from 'typescript-eslint';

/**
 * Flat ESLint config. Only TypeScript sources are linted; build output,
 * coverage and dependencies are ignored.
 *
 * Scoped ignores below are the only overrides in this repo:
 *   - apps/web-sp/e2e/**  Playwright specs (not run in CI in this task; they
 *                         need a signed-in session and their own runner).
 */
export default [
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      'apps/web-sp/e2e/**',
    ],
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['**/*.ts'],
  })),
];
