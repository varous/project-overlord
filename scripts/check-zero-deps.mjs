#!/usr/bin/env node
// Acceptance-gate guard: packages listed here must have ZERO runtime dependencies.
// devDependencies are allowed. Fails with a clear message on any non-empty "dependencies".
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Packages that are required to stay zero-dependency. Paths are relative to the repo root. */
const ZERO_DEP_PACKAGES = ['packages/geo-core'];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let failed = false;

for (const relPath of ZERO_DEP_PACKAGES) {
  const pkgPath = resolve(repoRoot, relPath, 'package.json');
  if (!existsSync(pkgPath)) {
    console.error(`check-zero-deps: FAIL — ${relPath}/package.json not found at ${pkgPath}`);
    failed = true;
    continue;
  }

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch (error) {
    console.error(`check-zero-deps: FAIL — ${relPath}/package.json is not valid JSON: ${error.message}`);
    failed = true;
    continue;
  }

  const dependencies = pkg.dependencies ?? {};
  const names = Object.keys(dependencies);
  if (names.length > 0) {
    console.error(
      `check-zero-deps: FAIL — ${relPath} must be zero-dependency but declares: ${names.join(', ')}`,
    );
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log(`check-zero-deps: OK — ${ZERO_DEP_PACKAGES.length} package(s) verified zero-dependency`);
