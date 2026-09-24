#!/usr/bin/env node
// Acceptance-gate guard: packages listed here must have ZERO runtime dependencies, except that
// they may depend on other listed zero-dep packages using workspace "*" versions.
// devDependencies are allowed. Fails with a clear message.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Packages that are required to stay zero-dependency. Paths are relative to the repo root. */
const ZERO_DEP_PACKAGES = ['packages/geo-core', 'packages/scene', 'packages/commands', 'packages/layout'];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let failed = false;

function readPackage(relPath) {
  const pkgPath = resolve(repoRoot, relPath, 'package.json');
  if (!existsSync(pkgPath)) {
    console.error(`check-zero-deps: FAIL — ${relPath}/package.json not found at ${pkgPath}`);
    failed = true;
    return null;
  }
  try {
    return JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch (error) {
    console.error(`check-zero-deps: FAIL — ${relPath}/package.json is not valid JSON: ${error.message}`);
    failed = true;
    return null;
  }
}

const packages = ZERO_DEP_PACKAGES.map((relPath) => ({ relPath, pkg: readPackage(relPath) }));
const allowedNames = new Set(
  packages.map((entry) => entry.pkg?.name).filter((name) => typeof name === 'string'),
);

for (const { relPath, pkg } of packages) {
  if (pkg === null) {
    continue;
  }

  const dependencies = pkg.dependencies ?? {};
  for (const [name, version] of Object.entries(dependencies)) {
    if (version !== '*') {
      console.error(
        `check-zero-deps: FAIL — ${relPath} depends on ${name}@${version}; workspace deps must use "*"`,
      );
      failed = true;
      continue;
    }
    if (!allowedNames.has(name)) {
      console.error(
        `check-zero-deps: FAIL — ${relPath} depends on ${name}, which is not a zero-dep package`,
      );
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log(
  `check-zero-deps: OK — ${ZERO_DEP_PACKAGES.length} package(s) verified zero-dependency`,
);
