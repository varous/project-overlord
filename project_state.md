# project-overlord — project state

Spatial event-site planning platform for Clockwork AV (Kolkata). Read **AGENTS.md** first: it is the
authority on the rules (integer tmm units, the site frame, provenance, immutable scene versions, no
money in this repo, zero-dependency packages, never commit secrets, never commit to `main`).

_Last updated: 24 Sep 2026._

## Where things are

| path | what | state |
|---|---|---|
| `packages/geo-core` | units, WGS84 frame, provenance, polygon predicates | zero-dep, merged |
| `packages/scene` | SceneDoc model, validation, versions, capacity, element registry | zero-dep, schema **v3** |
| `packages/commands` | typed edit commands with exact inverses, history, snapping, draw primitives | zero-dep |
| `packages/layout` | event brief, archetypes, deterministic layout engine | zero-dep |
| `packages/geom2` | boolean polygon ops over integer tmm rings (`polygon-clipping` only) | not zero-dep |
| `apps/api` | Fastify scene API + Postgres, deployed on Render | merged |
| `apps/web` | Cesium viewer, deployed on Cloudflare Pages | merged |
| `contracts/scene/v1..v3` | versioned SceneDoc JSON Schema + examples (v1/v2 kept on disk) | merged |
| `docs/benchmarks` | Aquatica V5 layout fixture (`aquatica-2026-04-03.fixture.json`) | merged |
| `infra`, `render.yaml` | Dockerfile, compose, Render blueprint (at the repo root) | merged |

## Tasks

- **001–011 merged into `main`** (foundation; Cesium viewer; resilience/smoke; placement; scene
  model; scene API; persistence; edit commands; camera/placement/watchdog/deploys; draw primitives
  and zone capacity; element library and linear elements).
- **012:** not present in this repo's history.
- **013 — ShowPlan import: IN PROGRESS, not pushed.** See `docs/task-013-state.md`.
  Branch `task/013-showplan-import` @ `cfe6530` exists locally with the filtered-history merge.
- **Next:** 013B (BOQ panel / EditorShell split), 014 (layout into the scene document, units).

## Current `main`

`main` @ `ab35c5d` (Task 011). Deployed:
- Web — Cloudflare Pages: `https://project-overlord-7xs.pages.dev` (branch previews at
  `https://<branch>.project-overlord-7xs.pages.dev`).
- API — Render, service `project-overlord-api` per `render.yaml`; `/health` reports `db` and `commit`.
- `make verify` gate: typecheck, lint, unit tests, zero-dep check, `apps/web` build, build check,
  and the offline/persistence/editing/drawing Playwright suite.

## Local-only artifacts (not in the repo)

- `~/scratch/showplan-filter` — history-rewritten ShowPlan clone (seed removed, tree under
  `imports/showplan`).
- `~/scratch/sp-seed-blobs.txt` — 24 blob hashes of every historical `packages/api/seed/` version,
  kept as the leak-gate reference.

## Guardrails to remember

- Never force-push; never commit task work directly to `main` (this file is a requested exception).
- The only files deployed are `apps/web` (Pages) and `apps/api` (Render, via the root
  `render.yaml`). `apps/web-sp` / `apps/api-sp` build and test in CI only.
- No API key or token, ever, in code, tests, fixtures, notices or reports.
- ShowPlan's seed/rate data must never reach this repo's history; the leak gate in
  `docs/task-013-state.md` must be green before any `task/013-*` branch is pushed.
