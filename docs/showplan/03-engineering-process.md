# Engineering Process — how this project is run

> This is the "how a software team actually works" document. It defines the
> phases, the artefacts each phase produces, and the working agreements the
> incoming dev team inherits.

---

## 1. The lifecycle

Each phase has **entry criteria**, **outputs**, and an **exit gate**. The gate is
what stops half-finished work flowing downstream and being discovered later.

| # | Phase | Outputs | Exit gate |
|---|---|---|---|
| 0 | **Discovery & Definition** | Charter, PRD, personas, success metrics | Problem, users and success measures agreed |
| 1 | **Design** | UX flows, wireframes, design system, ADRs, data model | A developer can build from the spec without guessing |
| 2 | **Planning** | Backlog, estimates, sprint plan, DoR/DoD | Sprint scope agreed and sized |
| 3 | **Implementation** | Working software, tests, PRs | Every story meets Definition of Done |
| 4 | **QA & Hardening** | Test results, perf/a11y/security findings, fixes | No open Sev-1/Sev-2 defects |
| 5 | **Release** | Deployed container, migrations, release notes | Deployed, smoke-tested, rollback rehearsed |
| 6 | **Operate & Iterate** | Monitoring, feedback, analytics review | Metrics reviewed, next cycle prioritised |
| 7 | **Handover** | Runbook, onboarding guide, architecture walkthrough | New team ships a change unaided |

**Where we are: Phase 0 → 1.** Charter and PRD drafted; data model and BOQ spec
blocked on the pricing workflow dump.

---

## 2. Roles

At MVP there is one builder (Joyjeet, via Cursor) wearing several hats. Naming
them matters, because at handover they become real people.

| Role | Accountable for | Now |
|---|---|---|
| Product Owner | Priorities, scope calls, accepting stories | Joyjeet |
| Tech Lead | Architecture, ADRs, code review, technical debt | Joyjeet + Claude |
| Developer | Implementation, tests | Cursor-assisted |
| QA | Test plan, exploratory testing, release sign-off | Joyjeet |
| Domain expert | Catalogue accuracy, BOQ correctness, pricing rules | Production/commercial team |

The **domain expert** role is the one most often forgotten and most damaging to
skip. A BOQ that is 90% right is worse than no BOQ, because it gets trusted.

---

## 3. Working agreements

### Branching — the Clockwork AV standard, same on every build

```
feature branches  ──PR──▶  dev-mac  ──PR──▶  main  ──▶  production
```

**`dev-mac` is staging**, and it is the **default base**: every branch is cut from
an up-to-date `dev-mac` and every finished branch targets it. The name is the dev
team's convention across all Clockwork AV builds — it is **not** machine-specific.
Never commit to `dev-mac` directly.

**Feature branches are `<concern>-<owner>`** — `pricing-policy-joyjeet`,
`variant-editor-sourav`. One concern each, cut from `dev-mac`.

The owner suffix exists because two people routinely solve the same problem two
different ways. **Both raise a PR into `dev-mac`, both get tested, and only the
winner merges.** That is a deliberate feature of the model, not an accident of
naming — see `AGENTS.md` for the full statement.

`main` is production and protected. It only ever receives merges from `dev-mac`,
and only after `dev-mac` has been run and seen to work.

### Commits
Conventional Commits — `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
Enables automated changelogs and makes `git log` a usable history.

### Pull requests
- Small: under ~400 lines changed where practical.
- Template: what changed, why, how it was tested, screenshots for UI.
- CI must pass: typecheck, lint, unit tests, build.
- One approval required once the team is more than one person.
- Render preview environments are **available but off by default** — they require
  a Pro workspace and bill per preview. Turn them on for a specific comparison,
  not as a standing default. See `docs/11-deployment-cost-plan.md` §preview.
- Docker image must build in CI, not only at deploy time.

### Definition of Ready *(a story may not be started until)*
- User story with acceptance criteria written
- Designs or a clear description of the UI
- Dependencies identified
- Estimated
- Test approach agreed

### Definition of Done *(a story is not done until)*
- Acceptance criteria met
- Unit tests for domain logic; e2e for the critical path
- Typecheck and lint clean
- Reviewed and merged
- Deployed to preview and manually verified
- Docs updated if behaviour or setup changed
- No new Sentry errors introduced

### Code review standard
Reviewers check, in this order: **correctness → security → readability →
performance → style.** Style is last and mostly automated; do not spend review
capital on formatting.

---

## 4. Cadence

While solo/MVP: daily 15-minute written self-standup in the project log
(done / next / blocked). It sounds like theatre for one person — it is not; it
is the record the incoming team reads to understand how the code got this way.

At team scale: 1–2 week sprints, planning at the start, demo and retro at the end,
backlog refinement mid-sprint.

---

## 5. Testing strategy

| Layer | Tool | What it covers | Target |
|---|---|---|---|
| Unit | Vitest | `domain/` — units, geometry, BOQ derivation, pricing | **90%+ on `domain/`** |
| Component | Vitest + Testing Library | Panels, forms, catalogue list | Key interactions |
| E2E | Playwright | Sign in → new project → upload map → calibrate → place → BOQ → export | The critical path, every release |
| Visual | Playwright screenshots | Editor and export rendering | Guard against silent layout breakage |
| Manual | Exploratory | Anything involving judgement or feel | Each release |

**Deliberately asymmetric.** `domain/` is where a bug becomes a wrong number in a
client's hands, so it gets near-total coverage. UI chrome gets far less. Chasing
a uniform coverage percentage across the codebase would waste the week.

---

## 6. Environments

| Env | Branch | Database | Purpose |
|---|---|---|---|
| Local | any | Postgres via `docker compose` | Development |
| Preview | any PR | Shared dev database | Review, stakeholder demo |
| Production | `main` | Render Postgres (paid) | Real use |

Database changes are **always** Prisma migration files in `prisma/migrations/`,
version controlled, never applied by hand in a dashboard. Migrations are applied
by **`infra/docker-entrypoint.sh`**, so a deploy never serves code that is ahead of
its schema.

> ⚠️ **Not `preDeployCommand`.** Render's `preDeployCommand` does not apply to
> Docker-based services — it would silently never run, and the first deploy would
> serve code against an empty schema. Prisma takes a Postgres advisory lock, so two
> instances starting at once is safe. See `docs/06-stack-review.md` finding #2.

---

## 7. Release process

1. Merge the feature branch into **`dev-mac`**; run it and confirm it works
2. Open a PR from `dev-mac` into `main`; CI runs typecheck, lint, tests, **and the
   Docker build**
3. Merge to `main`. Render builds the image; the **container entrypoint** runs
   `prisma migrate deploy` before the server starts
4. Render deploys the new container behind the health check at **`/healthz`**
   (liveness — deliberately does not touch the database, so a DB blip cannot kill
   the container). `/readyz` is the readiness probe that does check Postgres
5. Smoke test the critical path
6. Tag `v<semver>` and write release notes
7. Watch Sentry for 30 minutes

**Rollback:** redeploy the previous image from Render's deploy history
(near-instant, no rebuild). Migrations must be
backwards-compatible for one release — expand, migrate, then contract — so a
rollback never strands the database ahead of the code.

---

## 8. Managing technical debt

Debt is logged as tickets tagged `tech-debt` with a short note on cost and risk.
Allocate roughly 20% of each cycle to paying it down. Debt taken deliberately to
hit the 1-week MVP is fine — **undocumented** debt is not, because the incoming
team can't tell a shortcut from a mistake.

Known debt already accepted for the MVP is listed in `05-open-questions.md`.

---

## 9. Security practices

- Secrets in environment variables; never committed. `.env.example` documents
  every required variable.
- Tenant isolation enforced on every query, with a test proving cross-tenant
  access fails. Postgres RLS where practical, application-level scoping otherwise.
- Rate card and pricing logic execute server-side only.
- Dependencies scanned via Dependabot.
- Uploads restricted by MIME type and size.
- Anything touching auth or RLS requires explicit review, even when solo.
