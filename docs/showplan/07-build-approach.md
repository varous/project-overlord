# Project Approach — ShowPlan *(working title)*

> **Mode:** Pre-build strategy · **Date:** 12 Aug 2026
> Supersedes the stack sections of `02-architecture-and-stack.md`, and resolves
> the findings in `06-stack-review.md`.

---

## TL;DR

**Optimise for a replaceable backend, not for a neutral stack.** There is no
tech-stack-agnostic way to build software — every choice commits to something.
What *can* be made stack-agnostic are the **boundaries**: the API contract, the
database schema, the business rules, and the runtime.

Concretely: a **Vite + React 18 SPA** talking to a **Fastify REST API**, over
**Prisma-emitted plain SQL migrations** on Postgres, with **standard OIDC** auth,
all in **one Docker container on Render**. The API contract is the route handlers
plus Zod; there is no OpenAPI artefact yet.

The single highest-leverage handoff artefact is not the React code — it is
**`packages/domain`** (pure rules) plus **plain SQL migrations** plus
**`packages/web/src/lib/api.ts`** (the only file that talks to `/api/*`). An
incoming team can rewrite the Fastify server in Django and keep the SPA if those
three stay stable. An OpenAPI file would make that cheaper; we have not written
one yet, and slices must not wait for it.

---

## Project Frame

| | |
|---|---|
| **Goal** | Build a show/event site layout visually, derive a BOQ and indicative price from it, during a sales call |
| **Primary user** | Internal sales lead, screen-sharing live with a client |
| **Secondary** | Production manager (accuracy), client (read-only view) |
| **Stage** | Pre-build. Documentation exists; no product code written |
| **Timeline** | 1 week to internal MVP, built in Cursor by one person |
| **Dominant constraint** | **Handoff to an unknown dev team must not require a rewrite** |
| **Platform constraints** | Render, Docker, Google OAuth, env in Render (org standard) |
| **Cost** | Low; free tiers unusable (see Cost section) |

**Evidence status:** No product repository inspected — none exists. A prior 3D
prototype in this workspace (Three.js stage-plot editor, 679 converted models) is
**parked and not part of this build**; see `04-roadmap.md` v2.0. External research
performed against official docs and GitHub. **Community research (X/Reddit/YouTube)
was not performed** — official sources and repository signals were sufficient for
a stack decision. Say the word if you want community sentiment added.

**Key assumption still open:** the item catalogue, BOQ template and pricing rules
(OQ-02/03/04). Those shape the data model, not the stack, so this recommendation
stands independent of them.

---

## Decision Methodology

Criteria, weighted by your stated constraints:

| Criterion | Weight | Why |
|---|---|---|
| **Handoff / replaceability** | ★★★★★ | Explicitly your dominant requirement |
| Build speed (1 week, Cursor) | ★★★★☆ | Hard deadline, solo builder |
| Operational simplicity | ★★★★☆ | No ops team; you run this yourself |
| Editor capability | ★★★★☆ | The product *is* an editor |
| Hiring pool / familiarity | ★★★☆☆ | Team unknown, so breadth matters |
| Running cost | ★★★☆☆ | Low, but correctness outranks it |
| Scale | ★☆☆☆☆ | Handful of internal users |

**The reframe that drove this recommendation.** The instinct behind "don't lock
into a stack" is usually answered by picking something popular. That's the wrong
lever. Popularity doesn't make a Next.js app with server actions portable to a
Python team — the backend is fused to the React framework. Portability comes from
**explicit, standard boundaries**, and those can be built into any stack. So the
recommendation optimises the *seams*, then picks the fastest thing to build behind
them.

---

## Comparable Projects and References

### Direct domain comparables

**1. [Prismm](https://www.prismm.com/) (formerly AllSeated) — now part of Cvent**
Event design and 3D diagramming for venues and planners. Signal: acquired by
Cvent; actively marketed at time of review.
*Transfers:* venue-scaled floor plans, reusable item libraries, share-with-client
as a core workflow, the value of "show the client the space".
*Do not copy:* heavy 3D/VR walkthroughs (enterprise budget, and irrelevant to a
BOQ), and their seating-chart depth.

**2. [Cvent Event Diagramming](https://www.cvent.com/en/supplier-venue/event-diagramming-software) / [Social Tables](https://www.socialtables.com/product/diagram/)**
The incumbent in venue diagramming.
*Transfers:* to-scale floor plans, object libraries, collaborative review.
*Do not copy:* banquet/seating orientation and enterprise onboarding.

**Critical observation:** none of the established players derive a **BOQ and
price** from the layout. They are diagramming tools; the commercial artefact is
produced elsewhere. **That gap is your product.** It also means there is no
off-the-shelf answer to copy — the layout→BOQ→estimate chain is the part you must
design yourself, which is exactly why `domain/` deserves the care.

### Technical comparables

**3. [tldraw SDK](https://github.com/tldraw/tldraw)** — 47.1k stars; v5.0.1
released 15 May 2026. A feature-complete infinite-canvas React engine.
*Transfers:* canvas editor architecture — shape/tool/binding separation, command
history, viewport handling.
**Do not adopt:** the documentation states production use **requires a licence
key**. Free in development only. For an internal business tool that's a
commercial dependency, not a free library. **This rules it out unless you choose
to buy it** — and if editor quality later matters more than cost, it's the
strongest option on the market and worth revisiting.

**4. [Konva](https://github.com/konvajs/konva)** — 14.6k stars; v10.3.0 released
30 April 2026; 49 releases, actively maintained. Canvas scene graph with node
nesting, layering, hit detection, transforms, caching, export.
*Transfers:* it's the recommended building block.
*Understand the limit:* Konva gives you **primitives, not an editor**. Snapping,
alignment guides, measurement tools, undo/redo and the properties panel are all
yours to build. Budget for that. *(Confirm the licence text before committing —
I verified maintenance and releases, not the licence file contents.)*

**5. [Excalidraw](https://github.com/excalidraw/excalidraw)** — open-source
infinite canvas.
*Transfers:* the local-first persistence pattern — editor state kept client-side
and synced opportunistically. Directly applicable to the flaky-connectivity risk
on a live sales call.
*Do not copy:* freehand/whiteboard interaction model; yours is catalogue-driven.

**Did comparables change the recommendation?** Yes, twice. tldraw's licence gate
removed the option that would otherwise have saved the most build time. And the
absence of any BOQ-deriving comparable confirmed that the domain layer is the
genuinely novel part and should be the best-tested code in the repo.

---

## Recommended Stack

| Layer | Choice | Handoff property |
|---|---|---|
| **Frontend** | Vite + React 18 + TypeScript (SPA) | Static build; survives any backend rewrite |
| **Canvas** | Konva + react-konva | MIT-class dependency, no licence gate |
| **UI** | `design-system.css` tokens + `primitives.tsx`. Extend in `overrides.css` only. `design-system.css` is read-only | A later Figma pass is a token restyle, not a rewrite |
| **Undo** | `packages/web/src/lib/history.ts` — explicit command stack | Named, inspectable commands; no immer-patch store |
| **Local persistence** | `packages/web/src/lib/drafts.ts` — ~60 lines over IndexedDB, no `idb` package | Survives connectivity loss mid-call |
| **API** | Fastify + TypeScript REST. Zod at the handlers. No OpenAPI artefact yet | A Python/PHP team can replace `/api/*` and keep the SPA |
| **Database** | Postgres, **Prisma**. Migrations are plain SQL under `packages/api/prisma/migrations` | Any language can adopt the schema; the SQL is the handover |
| **Auth** | `openid-client` (standard OIDC) + httpOnly session cookie in Postgres | No vendor SDK; ~150 lines; portable |
| **Storage** | Cloudflare R2 via presigned URLs | Free egress (share links). Never proxy user files through the app |
| **Exports** | ExcelJS (BOQ) + pdf-lib (layout) | *Pending the template spike* |
| **Runtime** | Docker, `node:22-slim`, one container | Runs anywhere; not Render-specific |
| **Hosting** | Render (org standard) | |
| **Tests** | Vitest (domain + API), Playwright (`npm run test:e2e`, local stack — not CI) | Domain against the real 217-item seed |

### Changes from the previous proposal, and why

| Was | Now | Reason |
|---|---|---|
| Next.js App Router | **Vite SPA + separate API** | Next.js server actions fuse backend to React — the opposite of replaceable. Also a canvas SPA gets ~no benefit from RSC |
| Auth.js v5 | **`openid-client`** | Auth.js is Next-coupled and long-running-beta. Standard OIDC is portable and auditable |
| Prisma | **Prisma + `node:22-slim`** | We took the DX trade. Migrations are still plain SQL. The query-engine binary is why the image is Debian slim, not Alpine. Do not "tidy" this into Kysely without a reason |
| `node:22-alpine` | **`node:22-slim`** | Avoids musl native-module problems generally |
| `preDeployCommand` migrations | **Container entrypoint** | `preDeployCommand` does not apply to Docker services (verified in Render's Blueprint spec) |
| Zustand + `idb` | **`history.ts` + `drafts.ts`** | Both already in the repo. Slice 4 wires them. Do not add a second store |
| OpenAPI + contract tests | **Fastify routes + Zod** | Still the handover seam (`packages/web/src/lib/api.ts`). An OpenAPI file can be generated later; do not block slices on it |

**Honest note on the ORM.** Prisma emits plain SQL migration files, and a Python
team would introspect the database either way. We shipped Prisma for DX. The
handoff artefact is the SQL in `packages/api/prisma/migrations`, not the client.

---

## Cost and Vendor Reality

**Verified** against Render's documentation (observed 12 Aug 2026):

| Item | Finding |
|---|---|
| Free web service | Spins down after 15 min idle; ~1 min to wake. **Unusable** for a tool driven live on client calls |
| Free Postgres | **Expires 30 days after creation** (14-day grace), 1 GB, one per workspace. **Unusable** for real data |
| Web service plans | `free`, `starter`, `standard`, `pro`, `pro plus`, `pro max`, `pro ultra` |
| Postgres plans | `free`, `basic-256mb`, `basic-1gb`, `basic-4gb`, `pro-4gb`+ |
| `preDeployCommand` | Applies to **non-Docker** services — our migrations must run elsewhere |

**Cost scenarios** *(plan prices not verified — check Render's pricing page before
committing):*
- **Prototype:** free tiers only, and only if you accept a 30-day database lifespan.
- **Internal launch:** `starter` web + `basic-256mb` Postgres + R2 (pennies at
  this volume) + Sentry free tier. Small monthly figure; confirm current pricing.
- **Growth:** first pressure points are Postgres storage as base maps accumulate,
  then bandwidth. Keep maps on R2 (not the database) from day one so the database
  grows slowly.

**Lock-in assessment: low.** Docker runs anywhere. Postgres is portable. R2 is
S3-compatible and swaps for another bucket in a day. OIDC is a standard. The only
Render-specific artefact is `render.yaml`.

---

## Architecture Direction

```
┌──────────────────────── Docker container (Render) ────────────────────────┐
│                                                                            │
│   Fastify server                                                           │
│   ├── GET  /*          → serves the built Vite SPA (static)                │
│   ├── /api/*           → REST, defined by openapi.yaml                     │
│   ├── /healthz         → liveness (no DB call)                             │
│   └── entrypoint.sh    → runs SQL migrations, then starts the server       │
│                                                                            │
└───────┬──────────────────────────────┬─────────────────────────────────────┘
        │                              │
   Render Postgres              Cloudflare R2
   (schema = plain SQL)         (base maps, exports; presigned URLs)
```

### Source layout

```
showplan/
├── packages/web/              Vite + React 18 SPA
│   ├── src/components/        EditorShell, CanvasStage, primitives
│   ├── src/lib/api.ts         the only HTTP client — handover seam
│   ├── src/lib/history.ts     command-stack undo
│   ├── src/lib/drafts.ts      IndexedDB, no extra package
│   └── src/styles/            design-system.css (read-only) + overrides.css
├── packages/api/              Fastify REST
│   ├── src/routes/
│   └── prisma/migrations/     ⭐ plain .sql
├── packages/domain/           ⭐ PURE TS — zero runtime deps, no I/O
├── infra/                     Dockerfile, render.yaml, compose
└── docs/
```

### The four handoff seams

1. **`packages/web/src/lib/api.ts`** — every network call. A new team reimplements `/api/*`.
2. **`packages/api/prisma/migrations/*.sql`** — plain SQL. No DSL to translate.
3. **`packages/domain/`** — business rules as pure functions, no framework imports.
4. **ESLint `import/no-restricted-paths`** — seam #3 is mechanical, not aspirational.

---

## Alternatives Considered

**A. Next.js full-stack (the previous proposal)**
*Gain:* one framework, strongest Cursor fluency, largest talent pool.
*Give up:* backend/frontend separability — server actions fuse them.
*Harder later:* a non-JS team must rewrite everything, not just the API.
*Wrong when:* the handoff team is not TypeScript — which is precisely unknown here.

**B. tldraw SDK as the editor**
*Gain:* weeks saved; a genuinely excellent editor immediately.
*Give up:* budget and independence — **production requires a licence key**.
*Harder later:* migrating off a licensed SDK means rebuilding the editor.
*Wrong when:* you want zero commercial dependencies. **Right when** editor quality
becomes the bottleneck and the licence cost is smaller than the engineering time —
genuinely worth revisiting after the MVP.

**C. Django + HTMX + a JS canvas island**
*Gain:* if the team turns out to be Python, this is native to them; batteries
included for auth, admin and migrations. A free admin UI for the catalogue is a
real, underrated win.
*Give up:* a heavily interactive canvas editor fights server-rendered HTML; you'd
end up with a large JS island anyway.
*Wrong when:* the team is not Python — which we don't yet know. **If you learn
they're a Python shop before you start, tell me and I'd re-run this comparison
seriously.**

**D. Buy instead of build** — Prismm/Cvent for diagramming plus your existing
spreadsheet for BOQ.
*Gain:* nothing to build or maintain.
*Give up:* the entire point — the layout→BOQ derivation, which none of them do.
*Worth stating* so the build is a decision rather than an assumption.

---

## Build Plan

Each step is a **vertical slice** that runs end to end. Nothing is "wired up
later" — that's how week-long builds quietly become month-long ones.

**Slice 0 — Walking skeleton (½ day).** Repo, Docker, compose, Fastify serving a
Vite SPA, `/healthz` + `/readyz`, one SQL migration, deployed to Render. *Deploy on day
one — deployment surprises are the classic week-killer.*

**Slice 1 — Auth (½ day).** OIDC login, session cookie, `hd` domain gate,
protected route. Real users in a real database.

**Slice 2 — Projects (½ day).** Create/list/open. The dashboard shell.

**Slice 3 — Base map + calibration (1 day).** Upload to R2 (presigned URL), render
on canvas, draw a known distance, set the scale, persist it. Lands **inside
`EditorShell`** (map layer + calibrate mode) — not a separate pre-editor app.
Every measured quantity depends on it; highest-risk correctness path on a live
call. Uncalibrated is first-class (a map may exist with no scale); what is gated
is geometry-dependent **export**, not having a map.

**Slice 4 — The editor (2 days).** Konva object layer, catalogue panel
(`GET /api/catalogue/packages`, no rates), place/move/rotate/delete, properties
panel (flags read-only; placement params editable), undo/redo via existing
`history.ts`, IndexedDB drafts via existing `drafts.ts`, autosave. Wire what
exists — do not add a second store or the `idb` package. *The biggest slice;
protect its time.*

**Slice 5 — Measurement tools (½ day).** Distance (two-click) with live readout.
Informational only — never a BOQ line, never a quantity. Area deferred (rail
slot stays, disabled). Canvas mark shows the **calibration unit only**; the
inspector keeps the dual reading (cross-check). Dual-on-selected would change
label length and reflow marks on a busy sheet. ~~polygon area, manual override flagged.~~ The override
line was the pre-package F6.3 model; quantities come from `qty_rule`. See
docs/01 F6 (superseded 14 Aug 2026) and docs/13.

**Slice 6 — BOQ + estimate (1 day).** ✅ **Done** — `domain/boq.ts` and
`domain/pricing.ts` as pure functions. Live pass count is in `.agent/STATUS.md`
(domain tests line) — do not hardcode it here. See `13-boq-and-pricing-spec.md` §7.

**Slice 7 — Export (1 day).** Excel into your template, layout PDF. **Run the
ExcelJS spike the moment the template arrives — before this slice, not during it.**
Export is of an already-priced BOQ; Excel is not the pricing engine.

**Slice 8 — Share links (½ day).** Token links, viewer role, rates hidden.

That totals ~8 days of ideal time against a 7-day target, which is the honest
number. If something must go, drop Slice 8 and ship sharing in week two.

---

## Risks and Unknowns

| Risk | Trigger | Response |
|---|---|---|
| **Excel template can't be faithfully reproduced** | ExcelJS mangles merged cells/images/formulas | 2-hour spike on arrival. Fallback: rebuild template natively, or PDF + plain sheet |
| **Catalogue is incomplete** | Sales hits a missing item mid-call and stops trusting it | Highest-value non-technical workstream. Needs a named domain owner |
| **Editor slice overruns** | Snapping/undo/multi-select take longer than 2 days | Cut snapping and alignment guides first; they're polish, not function |
| **Handoff team is Python/PHP** | Learned after the build | Already mitigated by the contract + SQL + pure domain. Option C becomes worth re-examining |
| **Scale miscalibration produces silently wrong BOQs** | User skips or fumbles calibration | Disable measurement tools until calibrated; persistent scale readout; always-visible scale bar |
| **Konva performance at large sites** | A festival layout with 800+ elements | Layer caching, `perfectDrawEnabled(false)`, virtualise off-screen items. Confirm real element counts (OQ-08) |

### When this recommendation becomes wrong

- **The team is confirmed TypeScript/React** → Next.js becomes defensible again;
  the separability argument loses most of its force.
- **The team is confirmed Python** → seriously reconsider option C.
- **Editor quality becomes the differentiator** → buy the tldraw licence; the
  engineering time saved will likely exceed the fee.
- **This becomes a commercial multi-tenant SaaS** → revisit the single-container
  model, add background workers, a CDN and proper tenant isolation testing.
- **Real-time collaboration becomes a requirement** → this architecture needs a
  presence/CRDT layer bolted on; that's a re-architecture, not a feature.

---

## References

- [Render Blueprint specification](https://render.com/docs/blueprint-spec) — plan
  values; `preDeployCommand` applies to non-Docker services *(observed 12 Aug 2026)*
- [Render free tier documentation](https://render.com/docs/free) — 15-min spin-down,
  ~1-min wake, Postgres 30-day expiry, 1 GB *(observed 12 Aug 2026)*
- [tldraw/tldraw](https://github.com/tldraw/tldraw) — 47.1k stars, v5.0.1
  (15 May 2026); production use requires a licence key
- [konvajs/konva](https://github.com/konvajs/konva) — 14.6k stars, v10.3.0
  (30 Apr 2026), actively maintained
- [Prismm](https://www.prismm.com/) — direct domain comparable, now part of Cvent
- [Cvent Event Diagramming](https://www.cvent.com/en/supplier-venue/event-diagramming-software)
  and [Social Tables](https://www.socialtables.com/product/diagram/) — incumbent comparables
