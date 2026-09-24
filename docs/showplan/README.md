Imported from cav-tech-work/showplan at ab1781f. Full commit history and authorship live in that repository.

# ShowPlan *(working title)* — Documentation

A browser-based visual planner for event and show site layouts, with BOQ and
price estimation derived directly from the layout.

**Current phase:** Discovery & Definition → Design
**MVP target:** 1 week, internal use (sales team)

---

## Read in this order

| Doc | What it answers | Read if you are… |
|---|---|---|
| [`00-project-charter.md`](./00-project-charter.md) | Why this exists, who it's for, what success is, what's out of scope | Everyone — start here |
| [`01-prd.md`](./01-prd.md) | What we're building, in detail, with acceptance criteria | Product, engineering, QA |
| [`02-architecture-and-stack.md`](./02-architecture-and-stack.md) | The stack, the folder structure, and the reasoning behind each decision (ADR entries 001–008) | Engineering |
| [`03-engineering-process.md`](./03-engineering-process.md) | How the project is run: phases, branching, reviews, testing, releases | Everyone joining the team |
| [`04-roadmap.md`](./04-roadmap.md) | What comes after the MVP and why in that order | Product, stakeholders |
| [`05-open-questions.md`](./05-open-questions.md) | What we don't know yet, and what we assumed | Everyone — check before building |
| [`06-stack-review.md`](./06-stack-review.md) | Critique of the stack: 13 findings, incl. two defects found and fixed | Engineering |
| [`07-build-approach.md`](./07-build-approach.md) | The recommended build: stack, comparables researched, cost reality, build slices | Everyone — the "how" |
| [`08-domain-logic.md`](./08-domain-logic.md) | **How the product thinks** — derivation pipeline, quantity engine, composition, pricing layers | ⭐ Read before touching code |
| [`09-phased-plan.md`](./09-phased-plan.md) | **rev 2** — MVP → final product in 7 phases, with skip conditions | Product, stakeholders |
| [`10-head-start-analysis.md`](./10-head-start-analysis.md) | ⭐ **What already exists** — construction quantity takeoff; historical note that pricing was expected to leave MVP (superseded — see doc 13 §7) | Read before Phase 0 |
| [`13-boq-and-pricing-spec.md`](./13-boq-and-pricing-spec.md) | ⭐ **The engine** — how the seed data prices a layout, data findings, what it supersedes | Read before touching pricing |
| [`11-deployment-cost-plan.md`](./11-deployment-cost-plan.md) | How close to free we can run, blocker by blocker — **$13/mo recommended**, $0 documented | Engineering, whoever pays |
| [`14-arxiv-prior-art.md`](./14-arxiv-prior-art.md) | Stage 2 prior art — crowd sizing must come from codes, not papers; NL mapping stays lexical | Before Phase 4, before NL mapping |
| [`15-layout-corpus-study.md`](./15-layout-corpus-study.md) | ⭐ **171 real drawings mined** — standard footprints, placement conventions, implication rules, catalogue gaps | Before authoring packages |
| [`16-agent-workflow.md`](./16-agent-workflow.md) | How to run Cursor + Claude Code together, and which context file each reads | Read before your first build session |
| [`17-build-workflow-review.md`](./17-build-workflow-review.md) | The build loop — hooks, CI, who solves which problem, user testing | Read with 16 |
| [`RUNNING-LOCALLY.md`](./RUNNING-LOCALLY.md) | Clone → `.env` → Postgres → `npm run dev`; named boot failure modes | Before first local run |
| [`RUNNING-IN-PRODUCTION.md`](./RUNNING-IN-PRODUCTION.md) | Seed the live catalogue on Render (Shell command, expected counts) | Before the first production import |
| [`ENGINEERING-STANDARDS.md`](./ENGINEERING-STANDARDS.md) | Org-wide: Render, Docker, Google OAuth, config. **ADR-007** (headless UI libraries) lives in §11 | All projects; chrome slices read §11 first |

**Not yet written** (blocked on inputs — see `05-open-questions.md`):
`17-handover-guide.md` · `openapi.yaml`

**If you read only three documents:** `10-head-start-analysis.md` for what not to
build, `08-domain-logic.md` for how it thinks, and `07-build-approach.md` for how
it's built.

> **Before writing any code:** run the twenty-minute gate in `09-phased-plan.md`
> → Phase −1. One measurement can invalidate the entire build.

---

## The one-paragraph summary

Sales teams cannot show a client their event or price it during a call, so ideas
go cold while a designer draws and an estimator prices. ShowPlan lets someone
import a venue map, calibrate its scale, lay out the entire show footprint from
the company's real item catalogue, and export a BOQ and indicative price — inside
the call. The BOQ is *derived* from the layout, not re-entered, which is what
makes it fast and what makes it correct.

---

## Principles

1. **The layout is the source of truth.** Quantities are derived from it, never
   transcribed into it.
2. **Never show a number we can't stand behind.** If scale isn't calibrated,
   measurement tools are disabled rather than approximate.
3. **Business logic is framework-agnostic.** `domain/` is pure TypeScript so the
   commercially important rules survive any rewrite of the UI or backend.
4. **Speed beats fidelity for the primary user.** Priya is on a call. A beautiful
   feature she can't reach in two clicks is a feature she won't use.
5. **Document decisions, not just outcomes.** ADRs record *why*, so a future team
   can reopen a decision knowing what it was trading off.

---

## Status of the earlier 3D prototype

This project began as a 3D stage-plot builder before the requirements were
clarified. That work is **parked, not discarded** — see `04-roadmap.md` → v2.0.
It produced 679 SketchUp models converted to compressed glTF with verified
real-world dimensions, plus a repeatable asset pipeline. The measured footprints
may be useful to seed 2D catalogue dimensions sooner.
