# AGENTS.md — ShowPlan

**This file is the source of truth for every AI agent working on this repo.**
Cursor reads `AGENTS.md` and `.cursor/rules/*.mdc`. Claude Code reads `CLAUDE.md`.
`CLAUDE.md` and `.cursor/rules/` are **derived from this file** — when a rule
changes, change it here first, then propagate. Never let them disagree silently.

Full reasoning lives in `docs/`. Start with `docs/README.md`. If you read only
three: `docs/13-boq-and-pricing-spec.md` (the engine), `docs/12-frontend-reference-review.md`
(the UI), `docs/09-phased-plan.md` (what we're building now).

---

## What this is

A web app where a Clockwork AV salesperson lays out a festival or concert site on a
2D venue plan, places **packages** (Box Office, Entry Gate, Genset Drop) from the
real 217-item catalogue, and gets a BOQ and a priced quotation — **during a live
client call**. The BOQ is *derived* from the layout, never re-typed into it.

Stack: Vite + React 18 + TypeScript SPA · Konva canvas · Fastify REST API · Prisma +
Postgres · Docker on Render. Monorepo with npm workspaces.

## Glossary — one term per concept

If a sentence is read by a human it uses the **words**. If it is a key, an enum
value or a column name it uses the **code**. No variants. Not "venue build", not
"VC section", not "V.C.".

### Sections (cost families)

| Code (data, never change) | Words (every human sentence, internal and client-facing) |
|---|---|
| `VC` | Venue Construction |
| `OPS` | Operations |
| `POWER` | Power |

`TECH` is **not** a member of `Section`. Words: **Technical Production**. Out of
scope — audio, lighting, video and trussing. Adding it is a catalogue programme,
not an enum change.

**`VC` is overloaded.** Section `VC` is Venue Construction. Day-curve id `VC` is
a billed-days table that happens to share the letters. Always say which:
Venue Construction (`VC`) vs day-curve `VC`. Never write `if (curve === "VC")`.

Client exclusion (on every quote):
> This quotation covers Venue Construction, Operations and Power. Technical
> production — audio, lighting, video and trussing — is not included.

Internal warning (on every quote):
> Not a show total. Technical production is excluded.

### Day-curve ids (rows in `day_curves`, never an enum in code)

| Code | Shape |
|---|---|
| `FULL` | linear billed days |
| `ONCE` | flat 1 |
| `VC` | sub-linear market curve (the **curve**, not the section) |
| `RENT` | sub-linear |
| `PWR` | sub-linear |

Adding a curve is a row, not a deploy.

## The 14 non-negotiables

1. **`packages/domain` has zero runtime dependencies** and imports nothing from
   `api/` or `web/`. Enforced by ESLint `import/no-restricted-paths`.
2. **Money is integer paise.** Never a float, never `Decimal`. Round once, at the end.
3. **Lengths are canonical millimetres, areas square millimetres.** Display units
   never enter a calculation.
4. **Uncalibrated means `null`, not an estimate.** Geometric measurements return
   `null` without a scale and the UI disables the tool.
5. **Rates and pricing execute server-side only.** The rate card must never reach a
   non-admin browser. This is a security boundary, not a preference.
6. **`organisationId` on every tenant-scoped table**, from the first migration.
7. **No user file is ever served through the app server.** Always a presigned R2 URL.
8. **A missing rate is never zero.** Unpriced line, labelled "Price not specified",
   quote marked `incomplete`. A *supplied* CLIENT rate of 0 is a real price (a
   zero line, quote complete). Every seed item now has a CLIENT row; some still have
   no VENDOR row, which is correct.
9. **Curves, rates, cities, package contents are DATA.** Never `if (curve === "VC")`.
   Adding a curve is a row, not a deploy.
10. **Quotes snapshot and never re-price.** Every line stores its resolved rate,
    the city it came from, and the catalogue version.
11. **The layout places generators, not fuel.** Fuel enters the BOQ only when a
    generator *placement* has `runningHoursPerDay`, priced per placement then summed.
12. **Lines are exact; only the total rounds.** Nearest 100 rupees, once, at the total,
    with the delta shown as its own line.
13. **Quotes are drafts until issued.** Draft has no version. Issuing assigns one:
    `sequence` is the identity, `major`/`minor` is the label (11 → 12, major → 21).
14. **Never commit a secret.** Production values live in Render → Environment.

## Front-end rules

- `packages/web/src/styles/design-system.css` is **read-only** — it came from the
  design session. Extend in `overrides.css`, never edit in place.
- **Never hard-code a colour, size, radius or shadow.** All CSS custom properties.
- Theme is `data-theme="dark"` on `<html>`. No component reads a colour value.
- **Ink (`--accent-default`) is the only chrome emphasis.** Blue (`--selection`) is
  canvas-only — selection outlines, handles, active data-bar field. Never on chrome.
- **Konva reads colours from CSS at draw time** via `lib/canvas-colors.ts`.
- **Layout is frozen and verified:** menubar 40 · viewbar 44 · modebar 36 ·
  statusbar 32 · left panel 296 (rail 48) · right panel 300 · canvas flexes. At
  1366×768 **only the canvas shrinks**.
- **Capability flags, not deletions** (`lib/capabilities.ts`). Every V2 slot exists in
  every build; a capability that is off renders **disabled in place**. If a layout
  shifts when a flag flips, that is a bug.
- `/_reference` is DEV-only (ADR-008). Production builds do not serve the unfinished
  V2 shell.
- Anything built that the design handoff marks `NOT PRESENT` goes in
  `design-inventions.md`. Do not invent silently.
- `focus-visible` is not optional. Minimum hit target 24px — use `.hit-24`.
- Quantities and amounts use `.numeric`: 12.5px, `--text-primary`, tabular figures.
  **Never small, never grey** — a salesperson reads them aloud to a client.

## Testing, asymmetrically

- `packages/domain` — **90%+ coverage, every edge case.** Tests run against the
  **real 217-item seed**, not fixtures. Live pass count is in `.agent/STATUS.md`
  (domain tests line) — do not hardcode it here.
- `packages/api` — integration tests on routes that mutate.
- `packages/web` — Playwright on the critical path only: upload → calibrate →
  place → export.

Run `npm test` before every commit. A failing test is never "probably fine".

## Commands

```bash
npm install
docker compose -f infra/docker-compose.yml up -d db     # Postgres only
npm run prisma:migrate
npm run dev                                             # api :8080, web :5173
npm test
npm run lint
npm run import:catalogue -- packages/api/seed --dry-run  # validate the seed bundle
npm run docker:build
```

## Branching and release — the same model on every Clockwork AV build

```
feature branches  ──PR──▶  dev-mac  ──PR──▶  main  ──▶  production
(one concern each)         (staging)         (live)
```

**`main` is production.** Never commit to it directly. Code arrives only from
`dev-mac`, and only after `dev-mac` has been run locally and seen to work.
Merging to `main` is a release decision, not a code decision.

### Branch protection (deferred — GitHub Free)

GitHub Free private repos cannot enable branch protection or rulesets (need
Team/Pro/Enterprise). Until we upgrade, mitigations:

| Mitigation | What it does |
|---|---|
| `.githooks/pre-push` | Refuses pushes whose remote ref is `refs/heads/main`. Override: `git push --no-verify` |
| `core.hooksPath=.githooks` | **Per clone** — run after every clone (see setup below). Hooks do not travel with `git clone` alone |
| CI on PRs into `dev-mac` / `main` | Advisory-by-plan: Free cannot *require* the check. **Reviewers must look at the green tick by eye before merging** |
| `.github/CODEOWNERS` | Auto-requests review today (`@joyjeetpanday`); becomes enforcing the day protection is on — zero rework |

**What we would enforce on `main` once paid:** require a PR, block direct pushes,
block force pushes. Leave `dev-mac` unprotected (staging is merge-friendly).

**Trigger to buy GitHub Team *and* switch CODEOWNERS to an org team:** the first
external developer getting push access. Those two moves happen together — Team
unlocks required reviews / branch protection; CODEOWNERS then names an org team
instead of `@joyjeetpanday`. Team is $4/user/month for the first 12 months; at
2–3 people that is $8–12/month against a $13/month infra budget — deferred until
that hire, not forever.

### Local setup (every clone)

```bash
npm install
git config core.hooksPath .githooks   # refuses direct pushes to main
cp .env.example .env                  # fill secrets locally; never commit .env
docker compose -f infra/docker-compose.yml up -d db
npm run prisma:migrate
```

**`dev-mac` is staging.** There is no hosted staging environment — `dev-mac` is
exercised on localhost (`npm run dev`, api :8080, web :5173) against a local
Postgres. It is the **default base**: every branch starts from an up-to-date
`dev-mac` and every finished branch targets it. Never commit to `dev-mac`
directly either, except the merges themselves.

**Feature branches are `<concern>-<owner>`** — `pricing-policy-joyjeet`,
`variant-editor-sourav` — cut from `dev-mac`, one concern each. A branch named
`pricing-policy-*` changes pricing policy, not the canvas, not an unrelated fix
noticed in passing. That is what makes it a clean unit that can be accepted or
discarded whole. If the PR description needs the words "and also", it is two
branches.

### Competing implementations — the A/B pattern

Branches carry an owner's name because two people routinely solve the same
problem two ways. Both raise a PR into `dev-mac`:

- `pricing-policy-joyjeet`  →  PR into `dev-mac`
- `pricing-policy-sourav`   →  PR into `dev-mac`

Both are tested on staging — checked out in turn, run on localhost, driven
through the **same** scenario against the same seed. Only the winner is merged;
the other is closed, not left dangling. Worthwhile pieces of the loser are
cherry-picked onto the winner as a follow-up branch, in the open, rather than
quietly folded in.

**Only one of a competing pair ever reaches `dev-mac`.** Merging both is how a
codebase ends up with two pricing engines.

### Before opening any PR

```bash
git fetch origin && git merge origin/dev-mac   # a week of drift is a conflict, not a feature
npm test && npm run typecheck && npm run lint
npm run status                                 # regenerates .agent/STATUS.md
# append to .agent/JOURNAL.md, commit both

# Secret scan — must not ship credentials. `.env.example` is the *only* allowed
# match (variable contract, empty values). Anything else → stop, do not push.
hits=$(git ls-files | grep -Ei '\.env|\.pem|secret|credential' | grep -v '^\.env\.example$' || true)
if [ -n "$hits" ]; then echo "BLOCKED — unexpected tracked paths:"; echo "$hits"; exit 1; fi
echo "secret-scan: ok (.env.example only)"
```

A PR into `dev-mac` states **how it was exercised on localhost** — which screen,
which scenario, what you saw. "Builds fine" is not testing. A PR into `main` is a
release: it names the `dev-mac` commit it ships and confirms staging was actually
exercised, not merely green. Nothing reaches `main` that has not sat on `dev-mac`
first — not hotfixes, not one-liners, not "it's just a copy change".

### Drift watch

Feature branches diverge silently. The dangerous failure is not the merge
conflict, which is loud, but two branches that each merge cleanly and together
produce something nobody designed.

Periodically, for each active branch:

```bash
git log --oneline dev-mac..<branch>     # what it adds
git log --oneline <branch>..dev-mac     # what it has missed
git diff --stat dev-mac...<branch>      # where they overlap
```

Report in plain language what landed on `dev-mac` since the branch left, which of
it touches the same files or the same domain rules, and where the two are making
contradictory assumptions. Pay attention to clashes git cannot see: two branches
independently changing how a quantity resolves, how a rate is selected, or where
rounding happens will merge without a single conflict marker and still be wrong.
In a pricing system that is the expensive kind of mistake.

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
everything that is wrong rather than the first thing that is wrong. `npm run status`
and CI also run `scripts/qa-section-terms.mjs` — unapproved wording ("venue build",
"VC section", "V.C.", "VC+OPS+POWER") in docs, UI source and code comments fails
the build. `AGENTS.md` is skipped so this glossary can name the forbidden forms.

## Two traps already paid for

- **`preDeployCommand` does not work on Docker services on Render.** Migrations run
  from `infra/docker-entrypoint.sh`. Do not "tidy this up" into render.yaml.
- **Render's free Postgres expires 30 days after creation.** Plans are pinned in
  `infra/render.yaml` for a reason. Read the comments before changing them.

## Current state

Slice 0 (walking skeleton) and the BOQ/pricing engine are done. Slices 1–8 are in
`docs/09-phased-plan.md`. Next: slice 1 (Google OIDC + `hd` gate) or slice 6c (the
variant editor — the MANDATORY / DEFAULT_ON / OPTIONAL rules on screen).

Blocked on one input: the existing BOQ `.xlsx` template, for slice 7. Do not invent
its shape. Every catalogue item now has a CLIENT rate (seed_v2_2026-08-15); a
supplied rate of 0 is a real price, not a missing one.
