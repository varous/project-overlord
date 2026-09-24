# Task 013 — ShowPlan import: state at completion

**Branch:** `task/013-showplan-import`
**Base:** `main` @ `b3b1dfe` (docs-only commit; code baseline `ab35c5d`, Task 011)

## Status: STEPs 0–9 complete

- **STEP 0** — Task 011 merged (baseline CI run 36003806006).
- **STEP 1** — ShowPlan history rewritten outside the repo (`~/scratch/showplan-filter`): seed
  directory removed from all history, tree moved under `imports/showplan`. 24 seed blob hashes
  recorded in `~/scratch/sp-seed-blobs.txt`.
- **STEP 2** — filtered history merged with `--allow-unrelated-histories --no-ff` (`cfe6530`).
- **STEP 3** — moved into place: `packages/boq`, `apps/api-sp`, `apps/web-sp`, `docs/showplan`,
  `design/`, `apps/api-sp/infra`, `apps/web-sp/e2e`; `@showplan/*` → `@overlord/*`; `imports/` removed.
- **STEP 4** — pricing stripped from `packages/boq` and `apps/api-sp`; fuel consumption moved onto
  the item row; one new Prisma migration `20260924000000_strip_pricing`.
- **STEP 5** — `GET /api/projects/:projectId/boq` (quantities + findings, no money).
- **STEP 6** — synthetic `TEST_` bundle replaces the real seed; domain + API tests repointed; BOQ
  integration tests cover 2× aggregation, SHOW `instanceId: null`, uncalibrated findings.
- **STEP 7** — one toolchain: Node 24 / TS 5.9 / vitest 5; `prisma generate` in typecheck;
  workspace test scripts; `apps/api-sp` and `apps/web-sp` typecheck/test; CI creates and migrates
  `showplan_test`; `make verify` builds `apps/web-sp`.
- **STEP 8** — leak gate (below) green.
- **STEP 9** — AGENTS.md "ShowPlan lineage" section added.

## Leak gate (STEP 8)

| gate | check | result |
|---|---|---|
| a | every recorded seed blob hash absent | **pass** (no output) |
| b | `git log --all -- -- '*seed/rates.json' '*seed/items.json' '*seed/package_items.json'` | **pass** (no output) |
| c | pricing tokens in `packages/boq apps/api-sp apps/web-sp` | see the task report for the surviving-hit list; no rate DATA |
| d | no city-by-item rate table in the working tree | **pass** (none found) |

`git rev-list --all --objects | grep -c 'api/seed/'` is **0**.

## Verification

`make verify` passes end to end: typecheck (incl. `prisma generate`), lint, unit tests
(root 364 · boq 67 · api-sp 43 · web-sp 19), zero-dep check, `apps/web` + `apps/web-sp` builds,
offline/persistence/editing/drawing Playwright suite (20 passed).

## Local-only scratch (not in the repo)

- `~/scratch/showplan-filter` — history-rewritten ShowPlan clone.
- `~/scratch/sp-seed-blobs.txt` — 24 blob hashes, the leak-gate reference.
