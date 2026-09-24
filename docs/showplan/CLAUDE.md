# ShowPlan — working agreement

> **`AGENTS.md` at the repo root is the source of truth for all agents.** This file
> is the Claude Code view of it, plus the detail Cursor doesn't need. If the two ever
> disagree, AGENTS.md wins and this file needs regenerating.
> Cursor reads `AGENTS.md` + `.cursor/rules/*.mdc`. Claude Code reads this file.

Read `docs/README.md` first. If you read only three docs, read
`docs/10-head-start-analysis.md` (what already exists and what not to build),
`docs/08-domain-logic.md` (how the product thinks), and
`docs/09-phased-plan.md` (what we are building right now).

## What this is

A browser tool where a salesperson imports a venue plan, calibrates its scale,
lays out a show from Clockwork AV's real item catalogue, and exports a BOQ —
**during a live client call**. The BOQ is *derived* from the layout, never
re-typed into it.

The mechanism is construction **quantity takeoff**, ported to events. Use the
industry vocabulary: *assembly*, *measurement type*, *condition*, *takeoff*,
*deduct*. Estimators already know these words.

**Glossary lives in `AGENTS.md`.** Section codes `VC` | `OPS` | `POWER` never
change; every human sentence uses Venue Construction | Operations | Power.
`TECH` is Technical Production, out of scope. Day-curve ids: `FULL`, `ONCE`,
`VC`, `RENT`, `PWR`. `VC` is overloaded — section vs day-curve; always say which.

## The BOQ engine — read `docs/13-boq-and-pricing-spec.md` first

The product places **packages**, never bare items. Every BOQ line is *implied*
by a package's `qty_rule`. Two layers, do not conflate them:

- `qty_basis` on the **item** — what unit the thing is sold in (sqft, rft, nos, cbm)
- `qty_rule` on the **package line** — how much this kit needs (FIXED, PER_AREA,
  PER_LENGTH, PER_COUNT_PARAM:<param>)

Object model is **Template → Variant → Instance**. Templates are admin data and
versioned; editing one never mutates a project. A Variant is a project-local
named copy customised within the flag rules. An Instance is one canvas placement
carrying geometry only — never a quantity, never a price.

Pipeline, and it is exactly this: resolve qty per instance → aggregate by
`item_code` → per line `amount = qty × rate × billed_days` → sum. Fuel is the one
special case and uses **declared** days, not billed days.

`packages/api/seed/SCHEMA.md` is the data contract. `npm run import:catalogue --
packages/api/seed --dry-run` validates without writing.

## Non-negotiables

1. **`packages/domain` has zero runtime dependencies** and imports nothing from
   `api/` or `web/`. Enforced by ESLint `import/no-restricted-paths`. This is
   what lets the commercially important rules survive a rewrite of either side.
2. **Money is integer paise.** Never a float, never `Decimal`. Round once, at
   the end. `packages/domain/src/money.ts` is the only place that converts.
3. **Lengths are canonical millimetres, areas square millimetres.** Display
   units are presentation and never enter a calculation.
4. **Uncalibrated means `null`, not an estimate.** Every geometric measurement
   returns `null` without a scale, and the UI disables the tool. We never show a
   number we cannot defend.
5. **Rates and pricing execute server-side only.** The rate card must never
   reach a client viewer's browser. This is a security boundary.
6. **`organisationId` on every tenant-scoped table**, from the first migration,
   even with one organisation.
7. **No user file is ever served through the app server.** Always a presigned R2
   URL. This protects the egress bill, the bandwidth allowance and request
   timeouts at once.
8. **A missing rate is never zero.** An unpriced line keeps its quantity, has a
   `null` amount labelled **"Price not specified"**, and marks the whole quote
   `incomplete`. A *supplied* CLIENT rate of 0 is a real price: the line prints
   a zero amount and the quote is complete. Every seed item now has a CLIENT row; some
   still have no VENDOR row, which is correct.
9. **Curves and rates are DATA.** Never write `if (curve === "VC")`. Never
   hardcode an item code, a city, a curve name, or a package's contents. Adding
   a curve must be a row, not a deploy.
10. **Quotes snapshot and never re-price.** Every line stores the resolved rate,
    which city it came from, whether it fell back to generic, and the catalogue
    version. Admins keep editing rates; issued quotes must not move.
11. **The layout places generators, not fuel.** Fuel only enters the BOQ when a
    generator *placement* has `runningHoursPerDay` set, and it is priced per
    placement then summed — never on an averaged figure. Power planning proper
    is a separate later module; see `docs/04-roadmap.md`.
12. **Lines are exact; only the total rounds.** Nearest 100 rupees, once, at the
    total, with the delta shown as its own line. Rounding a line would make the
    page fail to add up.
13. **Quotes are drafts until issued.** A draft has no version. Issuing freezes
    the lines and assigns one. Version is **two things, deliberately**: an
    integer `sequence` (identity — monotonic, sorts, never runs out) and a
    `major`/`minor` pair rendered by concatenation (the human label: `11`, `12`,
    major bump → `21`, and past major 9 it just becomes `101`). `nextVersion` is
    total — it never throws, clamps, or refuses.
14. **Never commit a secret.** No `.env`, no client secret in a commit, a ticket,
   a screenshot or a chat message. Production values live in Render →
   Environment. If one leaks, rotate it in Google Cloud Console immediately.

## Stack, and why

| Layer | Choice | Reason |
|---|---|---|
| Frontend | Vite + React + TS (SPA) | Right shape for a canvas editor; decoupled from the backend |
| Canvas | Konva + react-konva | Scene graph and hit detection. Snapping, measurement and undo are ours |
| Backend | Fastify + TS REST | A plain REST service any language can reimplement at handover |
| Auth | `openid-client` + session cookie | Framework-agnostic, no beta dependency, ~150 lines |
| DB | Postgres + Prisma | Migrations are plain SQL and part of the handover pack |
| Storage | Cloudflare R2 | Free egress; client share links are egress |
| Host | Render, Docker, `node:22-slim` | Org standard. Debian, not Alpine — Prisma/musl |

Deliberately **not** Next.js: the App Router welds backend logic into the React
framework, and the handover requirement is that a Python or PHP team can replace
`/api/*` and keep the frontend. See `docs/06-stack-review.md` finding #1.

## Front-end conventions

The design system is a real handoff, not a guess. `design/handoff-digest.md` is
the source of truth for anything visual — read it before styling anything.

- **`styles/design-system.css` is read-only.** It came from the design session.
  Extend in `styles/overrides.css`, never edit in place. Every rule in
  `overrides.css` cites the digest §8 finding it closes.
- **Never hard-code a colour, size, radius or shadow.** Everything is a CSS
  custom property. `design/tokens.json` mirrors them for typed access.
- **Theme is `data-theme="dark"` on `<html>`.** Nothing else. No component reads
  a colour value.
- **Ink (`--accent-default`) is the only emphasis colour in chrome.** Blue
  (`--selection`) is canvas-only — selection outlines, handles, active data-bar
  field. Never on a chrome control. Active panel states use `--accent-soft`
  backgrounds, not colour.
- **Konva reads colours from CSS at draw time** via `lib/canvas-colors.ts` and
  re-reads on the `showplan:themechange` event. Never a literal in a Konva prop.
- **Layout is frozen.** The V2 shell dimensions are canonical and verified:
  menubar 40 · viewbar 44 · modebar 36 · statusbar 32 · left panel 296 (rail 48)
  · right panel 300 · canvas flexes. At 1366 × 768 **only the canvas shrinks**.
- **Capability flags, not deletions.** `lib/capabilities.ts` — every V2 slot
  exists in every build; a capability that is off renders **disabled in place**.
  The MVP must be a strict visual subset of the eventual 3D product so moving
  between them is never disorienting. If a layout shifts when a flag flips,
  that is a bug.
- `/_reference` is **DEV-only** (ADR-008). Production builds must not serve the
  unfinished V2 shell — slice 8 share links would leak it. Playwright hits it
  on `npm run dev`.
- **Anything you build that the digest marks `NOT PRESENT` goes in
  `design-inventions.md`.** That log is sent back to the design session to be
  formalised. Keep it accurate; do not invent silently.
- Minimum supported viewport is **1366 × 768** — a real laptop on a real call.
- `focus-visible` is not optional. Minimum hit target is 24px — use `.hit-24`.
- Quantities, rates and amounts use `.numeric`: 12.5px, `--text-primary`,
  tabular figures. **Never small, never grey** — a salesperson reads them aloud
  to a client.

## Testing, asymmetrically

- `packages/domain` — **90%+ coverage, and every edge case.** This is where
  wrong answers cost money. Tests run against the **real 217-item seed**, not
  fixtures — 48 passing, with the worked genset example arithmetic hand-checked.
- `packages/api` — integration tests on the routes that mutate.
- `packages/web` — Playwright on the critical path only: upload → calibrate →
  place → export. Do not unit-test the shell.

Run `npm test` before every commit. A failing test is never "probably fine".

## Commands

```
npm install
docker compose -f infra/docker-compose.yml up -d db   # Postgres only
npm run prisma:migrate                                 # create/apply migrations
npm run dev                                            # api :8080, web :5173
npm test
npm run lint
npm run docker:build                                   # verify the image builds
```

## Where things are

```
packages/domain   pure rules: units, money, geometry, scale, measurement
packages/api      Fastify server, routes, Prisma schema and migrations
packages/web      Vite SPA
  src/styles      design-system.css (read-only) · shell.css · overrides.css
  src/components  EditorShell · CanvasStage · primitives · Icon
  src/icons        73 SVGs, all currentColor
  src/lib         api · capabilities · theme · canvas-colors · drafts · history
design            handoff-digest.md · tokens.json  (design source of truth)
infra             Dockerfile, entrypoint, render.yaml, compose
docs              charter, PRD, ADRs, phased plan, research
design-inventions.md   what we built with no design — goes back to the designer
```

## Keeping the strategy session current — do this, it is not optional

There are two agents on this project: **Claude Code here in the repo**, and a
**Cowork/strategy session** that reaches this machine through a file bridge and owns
the docs, the research and the plans. The strategy session cannot watch you work. It
reads the repo. So the repo has to say what happened.

Two obligations, both cheap:

1. **Run `npm run status` after any meaningful change.** It regenerates
   `.agent/STATUS.md` — all five checks with pass/fail, **failure output verbatim**,
   git branch and recent commits, uncommitted diff, inventory, TODO/FIXME markers, and
   the latest journal entries. One file, complete picture. Always run it before asking
   the strategy session for a plan; a paraphrased error is useless for diagnosis.
2. **Append to `.agent/JOURNAL.md` at the end of a working session** — newest first,
   using the template at the top of that file. Record **what broke**, not just what
   worked. A journal of successes cannot be debugged against.

Commit both files. They are the handoff, and they cost seconds.

If you are stuck, say so in the journal and in your commit message rather than
half-fixing. "Blocked: X fails because Y, tried Z" is the most useful thing you can
leave behind.

## Automation — the rules that are now enforced, not remembered

`.claude/settings.json` is committed and defines three hooks. Run `/hooks` to see them.

| Hook | Event | What it does |
|---|---|---|
| `refresh-status.sh` | `Stop` (async) | Regenerates `.agent/STATUS.md` — but **only if a source file changed since the last one**, so a long session doesn't run the suite twenty times. ~35 ms when there is nothing to do |
| `check-journal.sh` | `SessionEnd` | If code changed but `.agent/JOURNAL.md` did not, it says so. It **reminds, it does not block** — a coerced journal entry is worthless |
| `guard-readonly.sh` | `PreToolUse` on `Edit`/`Write` | **Denies** edits to `design-system.css`, the seed bundle, `handoff-digest.md`, `tokens.json` and `STATUS.md`, each with a message saying where the change belongs instead |

The point of the guard is worth stating plainly: **a rule written in a document is a
hope; a rule in a `PreToolUse` hook is a wall.** The three files it protects are all
shared contracts with someone outside this repo — the design session, the master
Excel sheet — and editing them here breaks that contract silently.

CI (`.github/workflows/ci.yml`) runs the same checks on every PR into `dev-mac` and
`main`, plus the Docker build. Every step is `if: always()`, so one run tells you
everything that is wrong rather than the first thing that is wrong. Section wording
is checked by `scripts/qa-section-terms.mjs` (status + CI); the glossary is in
`AGENTS.md`.

## Two traps already paid for

- **`preDeployCommand` does not work on Docker services on Render.** Migrations
  run from `infra/docker-entrypoint.sh`. Do not "tidy this up" into render.yaml.
- **Render's free Postgres expires 30 days after creation.** The plan is pinned
  to `basic-256mb` for a reason.

## Current state

Slice 0 (walking skeleton) is scaffolded. Slices 1–8 are listed in
`docs/09-phased-plan.md`. **Before slice 3, sketch the scale-calibration
interaction on paper** — every quantity and every rupee downstream depends on
it, and it is the one screen with no design reference.

The catalogue and pricing logic have **arrived** (`packages/api/seed`) and the
engine is built. One input still blocks: the existing BOQ `.xlsx` template, for
slice 7. Do not invent its shape.

Every catalogue item now has a CLIENT rate. A supplied rate of 0 is a real price,
not a missing one. See `docs/13-boq-and-pricing-spec.md` for the engine.
