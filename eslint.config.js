import tseslint from 'typescript-eslint';

/**
 * Flat ESLint config. Only TypeScript sources are linted; build output,
 * coverage and dependencies are ignored.
 */
export default [
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'],
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['**/*.ts'],
  })),
];
