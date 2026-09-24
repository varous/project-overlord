# project-overlord — project state

Spatial event-site planning platform for Clockwork AV (Kolkata). Read **AGENTS.md** first: it is the
authority on the rules (integer tmm units, the site frame, provenance, immutable scene versions, no
money in this repo, zero-dependency packages, never commit secrets, never commit to `main`).

_Last updated: 24 Sep 2026 (Task 013R)._

## Where things are

| path | what | state |
|---|---|---|
| `packages/geo-core` | units, WGS84 frame, provenance, polygon predicates | zero-dep, merged |
| `packages/scene` | SceneDoc model, validation, versions, capacity, element registry | zero-dep, schema **v3** |
| `packages/commands` | typed edit commands with exact inverses, history, snapping, draw primitives | zero-dep |
| `packages/layout` | event brief, archetypes, deterministic layout engine | zero-dep |
| `packages/geom2` | boolean polygon ops over integer tmm rings (`polygon-clipping` only) | not zero-dep |
| `packages/boq` | ShowPlan domain: catalogue, packages, variants, BOQ, findings, export gate | zero-dep, 013R |
| `apps/api` | Fastify scene API + Postgres, deployed on Render | merged |
| `apps/web` | Cesium viewer, deployed on Cloudflare Pages | merged |
| `apps/api-sp` | ShowPlan API (catalogue, instances, `GET /api/projects/:id/boq`) | 013R — CI only, not deployed |
| `apps/web-sp` | ShowPlan editor shell | 013R — CI only, not deployed |
| `docs/showplan` | ShowPlan design record, ADR entries, agent log (rupee figures redacted) | 013R |
| `design/` | ShowPlan design tokens, layout conventions, handoff digest | 013R |
| `contracts/scene/v1..v3` | versioned SceneDoc JSON Schema + examples (v1/v2 kept on disk) | merged |
| `docs/benchmarks` | Aquatica V5 layout fixture (`aquatica-2026-04-03.fixture.json`) | merged |
| `infra`, `render.yaml` | Dockerfile, compose, Render blueprint (at the repo root) | merged |

## Tasks

- **001–011 merged into `main`** (foundation; Cesium viewer; resilience/smoke; placement; scene
  model; scene API; persistence; edit commands; camera/placement/watchdog/deploys; draw primitives
  and zone capacity; element library and linear elements).
- **012:** not present in this repo's history.
- **013:** superseded by 013R. Its branch `task/013-showplan-import` was deleted; its tree lives on
  in 013R, with ShowPlan's commit history deliberately removed and every rupee figure redacted.
- **013R — ShowPlan import without its history: COMPLETE on `task/013r-showplan-import`.** The tree
  is 013's, re-committed as a single commit on top of `main` with `Co-authored-by` credit; fuel
  tests restored; no rupee figure anywhere.
- **Next:** 013B (BOQ panel / EditorShell split), 014 (layout into the scene document, units).

## Current `main`

`main` @ `215549d`. Deployed:
- Web — Cloudflare Pages: `https://project-overlord-7xs.pages.dev` (branch previews at
  `https://<branch>.project-overlord-7xs.pages.dev`).
- API — Render, service `project-overlord-api` per `render.yaml`; `/health` reports `db` and `commit`.
- `make verify` gate: typecheck (incl. `prisma generate`), lint, unit tests (root · `packages/boq` ·
  `apps/api-sp` · `apps/web-sp`), zero-dep check, `apps/web` + `apps/web-sp` builds, build check, and
  the offline/persistence/editing/drawing Playwright suite.

## ShowPlan lineage

- Imported from `cav-tech-work/showplan` at `ab1781f`. That private repository keeps the full commit
  history and authorship; this repo carries **one** commit with `Co-authored-by` trailers, not
  ShowPlan's history.
- `packages/boq` is the domain for the catalogue, packages, variants, the BOQ, findings and the
  export gate. `docs/showplan` is the design record; its ADR entries stay in force unless overturned
  in writing.
- Catalogue data arrives from QuoteOS. No seed bundle containing rates may ever be committed.

## Guardrails to remember

- Never force-push; never commit task work directly to `main` (docs-only exceptions are requested).
- The only deployed surfaces are `apps/web` (Pages) and `apps/api` (Render, via the root
  `render.yaml`). `apps/web-sp` / `apps/api-sp` build and test in CI only.
- No API key or token, ever, in code, tests, fixtures, notices or reports.
- No rupee figure in the ShowPlan-lineage trees: redact to symbols or words, never a figure.
