# Task 013 — ShowPlan import: state at hand-off

**Branch:** `task/013-showplan-import` (local only, **not pushed**)
**HEAD:** `cfe6530 "Import ShowPlan (seed and rate data removed from history)"`
**Base:** `main` @ `ab35c5d` (Task 011 merged and pushed)

## Why it stopped
The work was paused before STEP 3 with the session's working room exhausted. Stopping at a
committed, resumable merge was chosen over leaving a half-stripped import. The branch was **not
pushed**, because STEP 8 forbids pushing until leak gates a–d are all green and gates c/d depend on
the (unperformed) STEP 4 pricing strip.

## Done
- **STEP 0** — `task/011-element-library` merged fast-forward into `main` and pushed (`ab35c5d`).
  Baseline CI run: https://github.com/varous/project-overlord/actions/runs/36003806006
  (still running when this note was written).
- **STEP 1** — ShowPlan history rewritten **outside** the repo, in `~/scratch/showplan-filter`:
  installed `git-filter-repo` 2.47.0; fresh clone; `--path packages/api/seed/ --invert-paths`;
  `--to-subdirectory-filter imports/showplan`. **79 commits preserved, no squash.** Recorded the
  blob hash of every historical `packages/api/seed/` version in `~/scratch/sp-seed-blobs.txt`
  (**24 lines**).
- **STEP 2** — fetched the filtered clone as a temporary remote, merged with
  `--allow-unrelated-histories --no-ff` (commit `cfe6530`), removed the remote. `origin` is the only
  remote; the unfiltered ShowPlan repo was never fetched into this repo.

## Not done (STEPs 3–9)
Tree moves (`packages/boq`, `apps/api-sp`, `apps/web-sp`, `docs/showplan`, `design/`), the
`@showplan/*` → `@overlord/*` import rewrite, the **pricing strip** in `packages/boq` and
`apps/api-sp` (incl. the Prisma migration), the synthetic 12-item test fixture, repointing ~39 test
files, the `GET /api/projects/:projectId/boq` route, the one-toolchain work, CI/Makefile wiring and
the AGENTS.md "ShowPlan lineage" section.

## Leak gate (as it stands)
| gate | check | result |
|---|---|---|
| a | every recorded seed blob hash absent | **pass** (no output, in both repos) |
| b | `git log --all --oneline -- '*seed/rates.json' '*seed/items.json' '*seed/package_items.json'` | **pass** (no output) |
| c | `git grep -nIiE 'paise\|rupee\|valuePaise\|priceBoq\|"VENDOR"'` on the imported trees | **fail — 299 hits** (STEP 4 not done) |
| d | no city-by-item rate table in the working tree | not yet adjudicated (the only such file, `seed/rates.json`, is gone from history and tree) |

The filter itself did its job: `git rev-list --all --objects | grep -c 'api/seed/'` prints **0** and
none of the 24 recorded rates-bearing blobs survive.

## Resuming
`git checkout task/013-showplan-import`, then start at STEP 3. Useful paths:
`~/scratch/showplan-filter`, `~/scratch/sp-seed-blobs.txt`. To abandon:
`git branch -D task/013-showplan-import` (and optionally `rm -rf ~/scratch`).
