# Architecture & Stack

> **Status:** Draft v0.1 · Decisions recorded as ADRs with the reasoning intact,
> so a future team can re-open a decision knowing *why* it was made.

---

## 1. Chosen stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Vite + React 18 + TypeScript SPA** + **Fastify** REST | Canvas-shaped SPA; handover seam at `/api/*`. See ADR-006 (amended) |
| 2D canvas | **Konva.js + react-konva** | Purpose-built for object-based 2D editors: scene graph, drag/transform handles, hit detection, layers, image export. See ADR-001 |
| UI chrome | **Radix** primitives, styled with `design-system.css` (no Tailwind) | Behavior from the library; visuals from the handoff. See ADR-007 |
| Client state | **zustand** + **zundo** (labels via `handleSet`); `history.ts` until undo migrates | ADR-007. High-frequency canvas state stays off the server |
| Hotkeys | **react-hotkeys-hook** | ADR-007 — do not hand-roll shortcut handling |
| Command palette | **cmdk** (Cmd-K) | ADR-007; slice not built yet (`09-phased-plan.md`) |
| Panel splits | **react-resizable-panels** | ADR-007 |
| Palette drag | **dnd-kit** (DOM / keyboard); Konva drop coordinates stay ours | ADR-007 consequence (b) |
| Toasts | **sonner** | ADR-007 |
| Canvas handles | **Konva.Transformer** | ADR-007; slice not built yet. Do not hand-roll handles |
| Server state | Fetch via `packages/web/src/lib/api.ts` | Single handover seam for network calls |
| Auth | **`openid-client`** + Google OIDC (own GCP project) + session cookie | Framework-agnostic; `hd` gate server-side. See ADR-006 |
| Database | **Render Postgres** + **Prisma** | Org standard. Managed, colocated with the app |
| Object storage | **Cloudflare R2** (presigned URLs) | Free egress; OQ-13. Never serve user files through the app |
| Packaging | **Docker** (multi-stage, non-root, `node:22-slim`) | Org standard — every build containerised |
| Hosting | **Render** (Docker web service, Blueprint) | Org standard. See ADR-006 |
| Spreadsheet export | **ExcelJS** | Can populate an existing `.xlsx` template rather than generating a generic sheet |
| PDF | **pdf-lib** (generate) + **pdf.js** (read imported maps) | Both mature, both work client- and server-side |
| Validation | **Zod** | One schema, used for both runtime validation and inferred TS types |
| Testing | **Vitest** (unit) + **Playwright** (e2e) | Playwright already proven in this project |
| CI | **GitHub Actions** | Typecheck, lint, test **and Docker build** on every PR |
| Errors | **Sentry** (free tier) | |

**Running cost during internal use: low, not zero.** See ADR-006 — Render's free
tiers are not viable here (web services sleep after 15 min with a ~1 min cold
start; free Postgres *expires after 30 days*). Budget for the lowest paid tier on
both the web service and the database. R2 and Sentry stay within free
allowances at internal volume.

**All infrastructure decisions follow [`ENGINEERING-STANDARDS.md`](./ENGINEERING-STANDARDS.md),
which applies org-wide.** Scaffolding lives in `infra/`: `Dockerfile`,
`docker-compose.yml`, `render.yaml`, `.env.example`.

---

## 2. Architectural principle: the handover seam

The platform is now known (Render + Docker + Google OAuth), but the dev team's
*language and framework preferences* still are not. The architecture therefore
assumes **the backend may be replaced** and makes that cheap.

```
┌──────────────────────────────────────────────┐
│  app/            Next.js routes, pages, UI   │  ← replaceable, framework-specific
├──────────────────────────────────────────────┤
│  features/       editor, catalogue, boq…     │  ← React, feature-sliced
├──────────────────────────────────────────────┤
│  domain/         types, units, BOQ rules,    │  ← PURE TypeScript.
│                  pricing, validation          │    No React. No Prisma. No I/O.
├──────────────────────────────────────────────┤
│  data/           repository INTERFACES       │  ← the seam
│    └ prisma/     Prisma implementations      │  ← swap this, keep everything else
└──────────────────────────────────────────────┘
```

**The rule:** `domain/` may not import from `app/`, `features/` or `data/`.
Everything commercially important — how a BOQ is derived, how quantities are
computed from geometry, how an estimate is assembled — lives in `domain/` as
pure, unit-tested functions.

Consequences:
- If the team is Python/PHP/.NET, they reimplement `data/` against their own API.
  The editor, the BOQ logic and the UI are untouched.
- The BOQ rules can be tested without a browser, a database or a network.
- Business logic is readable by someone who doesn't know React.

Enforced by ESLint `import/no-restricted-paths`, checked in CI — not by good intentions.

---

## 3. Proposed repository layout

```
showplan/
├── app/                        # Next.js App Router
│   ├── (auth)/                 # sign-in
│   ├── (app)/projects/         # dashboard
│   ├── (app)/editor/[id]/      # the editor
│   ├── share/[token]/          # public read-only view
│   └── api/                    # server routes (exports, estimates)
├── features/
│   ├── editor/                 # canvas, tools, panels
│   ├── catalogue/
│   ├── boq/
│   └── projects/
├── domain/                     # ⚠️ pure TS, no framework imports
│   ├── types.ts
│   ├── units.ts                # unit conversion + formatting
│   ├── geometry.ts             # area, length, scale maths
│   ├── boq.ts                  # layout → BOQ derivation
│   └── pricing.ts              # BOQ → estimate
├── data/
│   ├── repositories.ts         # interfaces only
│   └── prisma/                 # the swappable implementation
├── components/ui/              # shadcn
├── prisma/                     # schema.prisma + migrations (version controlled)
├── infra/                      # Dockerfile, render.yaml, docker-compose
├── e2e/                        # Playwright
└── docs/                       # this folder
```

Single app, strict internal boundaries — **not** a monorepo. A monorepo adds
tooling overhead that a 1-week MVP and a small team don't earn. The folder
boundaries mean extracting packages later is mechanical if it's ever needed.

---

## 4. Key flows

**Scale calibration → measurement.** All geometry is stored in *canvas units*.
A layout holds one `scale` value (real metres per canvas unit). Every real-world
number shown or exported is computed at read time via `domain/geometry.ts`.
Storing raw geometry and deriving measurements means **recalibrating fixes every
quantity retroactively** rather than corrupting stored data.

**Layout → BOQ.** `domain/boq.ts` takes `(elements, catalogue)` and returns BOQ
lines. Pure function, no I/O. Runs identically in the browser for live preview
and on the server for authoritative export.

**BOQ → estimate.** `domain/pricing.ts` takes `(boqLines, rateCard, eventMeta)`.
Runs **server-side only** — the rate card must never reach a client viewer's
browser. This is a security boundary, not a preference.

---

## 5. Architecture Decision Records

### ADR-001 — Konva.js for the 2D canvas
**Status:** Accepted · **Date:** 11 Aug 2026

*Context.* We need an object-based 2D editor: place, select, drag, rotate,
resize, layer, snap, and export to image, at ~500 objects.

*Options considered.*
- **Raw SVG + React** — simplest mental model, but DOM-node-per-element degrades
  badly past a few hundred elements, and hit detection/transform handles are all
  hand-built.
- **Fabric.js** — mature and capable, but an older imperative API and weaker
  React integration.
- **PixiJS** — fastest rendering, but it's a game engine; no built-in transform
  handles, and we'd build the editor primitives ourselves.
- **tldraw** — excellent editor out of the box, but strongly opinionated toward
  whiteboarding and harder to bend to a catalogue-driven BOQ tool.
- **Konva + react-konva** — canvas-based (fast), has a real scene graph, ships a
  `Transformer` for resize/rotate handles, layers, hit detection, and
  `toDataURL()` for export. Idiomatic React bindings.

*Decision.* **Konva + react-konva.** It's the only option that gives us editor
primitives *and* React integration *and* canvas performance without building the
interaction layer from scratch.

*Consequences.* Canvas content isn't in the DOM, so it's not screen-reader
accessible — an acknowledged gap (see PRD §7). If we later need 3D, Konva is
2D-only and a separate renderer would be added alongside, not replaced.

---

### ADR-002 — Framework-agnostic domain layer
**Status:** Accepted · **Date:** 11 Aug 2026

*Context.* The MVP is built in Cursor by one person, then handed to a dev team
whose language and framework are **not yet known**.

*Decision.* All business logic lives in `domain/` as pure TypeScript with no
framework or vendor imports. All persistence sits behind repository interfaces
in `data/`.

*Consequences.* Slightly more ceremony than calling the ORM directly from components.
In exchange, the highest-risk handover scenario — "the team uses Django, so we
rewrote it" — costs one adapter instead of the whole application. Given the
handover is a stated project goal, this trade is clearly worth it.

---

### ADR-003 — Supabase for the MVP backend
**Status:** ⛔ **SUPERSEDED by ADR-006** · **Date:** 11 Aug 2026
> Retained deliberately. A superseded ADR is more useful than a deleted one —
> it shows what was considered and why it changed.

*Context.* Need auth, database, file storage and row-level access control, at
near-zero cost, in one week.

*Decision.* Supabase.

*Rationale.* It's **Postgres**, not a proprietary datastore — the schema and data
are portable to any Postgres host, and RLS policies are standard SQL. Auth,
storage and DB in one service removes a week of integration work. Free tier
covers internal use.

*Consequences.* Some coupling to Supabase's auth model and client SDK — contained
in `data/supabase/`. If self-hosting is later required, Supabase itself is
self-hostable, and the schema moves to plain Postgres regardless.

---

### ADR-004 — 2D only for the MVP
**Status:** Accepted · **Date:** 11 Aug 2026

*Context.* An earlier prototype in this project built a full 3D editor
(Three.js) with a 500-item catalogue and an asset pipeline converting 685
SketchUp models to compressed glTF.

*Decision.* The MVP is 2D. The 3D work is parked, not deleted.

*Rationale.* A BOQ is derived from footprint, quantity and unit — none of which
3D improves. 3D triples the interaction complexity, slows the editor, and is
harder to drive live on a sales call. The 1-week timeline does not survive it.

*Consequences.* The Three.js engine, the 685 converted models and the asset
pipeline are retained as inputs to a post-MVP "3D visualisation" phase. Nothing
is thrown away — see `04-roadmap.md`.

---

### ADR-005 — Store geometry, derive measurements
**Status:** Accepted · **Date:** 11 Aug 2026

*Context.* Quantities depend on a user-supplied scale calibration, which may be
wrong and may be corrected later.

*Decision.* Persist raw canvas geometry plus a single per-layout scale factor.
Never persist computed real-world measurements as the source of truth.

*Consequences.* Fixing a bad calibration corrects every quantity automatically.
Costs a small computation at read time — negligible relative to being able to
recover from the most likely and most damaging user error in the product.

---

### ADR-006 — Render + Docker + Google OAuth (supersedes ADR-003)
**Status:** Accepted · **Date:** 11 Aug 2026 · **Source:** organisation standard  
**Amended:** 13 Aug 2026 — auth library, SPA packaging, and object storage (see note below)

*Context.* The dev team's established platform is Render, all builds are
containerised with Docker, authentication uses Google OAuth credentials created in the
Google Cloud Console (this app gets its own GCP project), and configuration
lives in Render Environment. This supersedes the earlier Vercel + Supabase assumption, which was
made before the team's platform was known.

*Decision.*

- **Hosting:** Render Docker web service, defined in `infra/render.yaml`
- **Packaging:** multi-stage Dockerfile (`node:22-slim`), non-root runtime; Vite + React SPA
  built into `packages/web/dist` and served by Fastify in production (same origin)
- **API:** Fastify + TypeScript REST under `/api/*` (handover seam — replaceable)
- **Auth:** Google OIDC via `openid-client` + httpOnly session cookie backed by the
  `Session` table in Postgres; internal access gated on the `hd` hosted-domain claim
  **server-side** (`ALLOWED_HD=clockwork-av.com`). Callback path:
  `{PUBLIC_BASE_URL}/api/auth/callback` — not an Auth.js-shaped URL
- **Database:** Render Postgres with Prisma migrations
- **Storage:** Cloudflare R2 with presigned URLs (never proxy user files through the app)
- **Config:** Render Environment; `.env.example` is the committed contract

*Rationale.* Matching the team's platform (Render + Docker + owned Google OAuth client)
is the handover goal. The SPA + Fastify split keeps the commercially important rules in
`packages/domain` and lets a future team reimplement `/api/*` without rewriting the
canvas. Owning the OAuth client (rather than delegating to a BaaS auth product) keeps
identity under our Google Cloud project.

*Superseded by (13 Aug 2026).* The 11 Aug decision body named three choices that did not
survive the stack review and open-question pass:

| Original (11 Aug) | Now | Why |
|---|---|---|
| Auth.js (NextAuth v5) | `openid-client` + session cookie | `06-stack-review.md` finding #4 — Auth.js couples to Next.js; ~150 lines of standard OIDC is portable and auditable |
| Next.js standalone output | Vite + React SPA behind Fastify | `06-stack-review.md` finding #1 — App Router welds backend into the React framework; handover requires a plain REST boundary |
| Google Cloud Storage | Cloudflare R2 | `05-open-questions.md` OQ-13 — free egress (share links are egress), S3-compatible |

Org-wide `ENGINEERING-STANDARDS.md` still documents Auth.js for *Next.js* products;
ShowPlan is the Fastify exception and uses the redirect URIs in §4 (amended).

*Consequences — read these before assuming free hosting.*

Render's free tiers are **not usable for this product**:

| Free tier behaviour | Why it breaks this product |
|---|---|
| Web service sleeps after 15 min idle, ~1 min cold start | The tool is used live on client calls. A one-minute blank screen is precisely the humiliation it exists to prevent |
| Postgres **expires 30 days after creation** | Silent, scheduled loss of real client layouts |
| Postgres capped at 1 GB, one per workspace | Base maps and layouts will exceed this |

Therefore `render.yaml` specifies **paid plans** for both. This is a deliberate,
recorded trade against the "near-zero cost" constraint in the charter: correctness
and availability win, and the amount involved is small.

Secondary consequences: no Vercel-style edge functions or image optimisation CDN
(not needed); we own more infrastructure config, which is the price of
portability; and Docker builds must run in CI, not only at deploy time, so a
broken container is caught before Render sees it.

---

### ADR-007 — Headless UI libraries
**Status:** Accepted · **Date:** 15 Aug 2026

Full text, including the six acceptance-criteria consequences, bundle
measurements and verified licenses: [`ENGINEERING-STANDARDS.md`](./ENGINEERING-STANDARDS.md) §11.

*Context.* Chrome behavior (menus, dialogs, focus, undo, hotkeys) was being
hand-rolled next to a frozen design-system.css. That duplicates work Radix,
zundo, cmdk and the rest already solved, and it is where accessibility
regressions hide.

*Decision.* All UI chrome behavior comes from the adopted headless libraries,
styled with existing design-system.css classes. Do not hand-roll focus
management, menu keyboard navigation, dialog behavior, undo stacks, or hotkey
handling. Retrofit opportunistically (rule 2). `CanvasMode` and all domain
logic stay as they are. Konva remains the canvas engine. Konva.Transformer is
the handle implementation — do not reimplement handles.

*Consequences — later slices fail review if they skip these.*

- **(a) Undo labels must survive.** zundo has no action name. Stamp a label per
  snapshot with `handleSet`; keep "Undo Move 3 elements". A bare "Undo" is a
  QA-20 regression. `history.ts` stays until that slice.
- **(b) dnd-kit does not solve the drop.** Pointer → stage coordinates (zoom,
  pan) remain our code. Adopted for the palette-side affordance and keyboard
  dragging; check Konva sensor conflicts before using it for canvas drops.
- **(c) QA-24 will go blind.** Radix handlers are `onSelect` / `onValueChange`.
  Every control-migration PR must update `scripts/qa-no-handler.mjs` in the
  same PR.
- **(d) Disabled items leave the focus order.** Capability flags still render
  every V2 slot disabled in place. Accept Radix's skip-disabled keyboard
  behavior.
- **(e) Calibration is not modal.** `.cal-dialog` is a floating panel so the
  plan stays visible. When it migrates: `modal={false}` or Popover. A modal
  calibration dialog fails review.
- **(f) The bundle ceiling is a budget.** Equal before/after sizes at install
  are tree-shaking, not a free lunch. Ceiling is **400,000 B** gzip (raised
  once from 320,000). Radix's first primitive carries portal/popper/focus
  scope/dismissable layer that later primitives reuse; projected total once
  every ADR-007 library is imported is ~380–395 KB. 400,000 B is ~2s on
  1.5 Mbps venue Wi-Fi, cold cache, once per salesperson per day. Do not
  raise it incrementally. A rise above 400,000 is a design conversation.

cmdk and Konva.Transformer are net-new slices in `09-phased-plan.md`; rule 2
will never trigger them.

Supersedes `06-stack-review.md` finding #6 (command stack vs patches). The
named-undo concern is preserved by (a), not dropped.

### ADR-008 — `/_reference` is DEV-only
**Status:** Accepted · **Date:** 15 Aug 2026

`/_reference` renders `EditorShell` with every capability on. It is a
client-side path in `App.tsx`, not a server route. Anyone who types the URL
in a deployed build would get the unfinished V2 shell.

Options considered: (a) strip it from production (`import.meta.env.DEV`);
(b) keep it and gate on `ADMIN`; (c) leave it open with a note to close
before slice 8.

**Chose (a).** Playwright and local visual checks run against `npm run dev`,
so the route stays for the menubar keyboard spec and Figma diffs. It is not
needed against a deployed build. (b) would still ship the FULL shell into
the production bundle. (c) is a time-bomb next to slice 8 share links.

Production visits to `/_reference` fall through to the signed-in dashboard
(or sign-in). Helper: `packages/web/src/lib/reference-route.ts`.

