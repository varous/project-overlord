# Stack Review — weaknesses in the current proposal

> **Status:** Review v1 · **Date:** 12 Aug 2026
> A deliberate critique of the stack in `02-architecture-and-stack.md` *before*
> committing to it. Several findings are defects in scaffolding I wrote in the
> previous pass; those are marked 🔴 **my error**.

---

## Severity summary

| # | Finding | Severity | Fix cost now | Fix cost later |
|---|---|---|---|---|
| 1 | Next.js App Router is the wrong shape for this app **and** for the handover | 🔴 Critical | Low (not built yet) | Very high (rewrite) |
| 2 | `preDeployCommand` doesn't apply to Docker services — migrations have no path | 🔴 Critical | Trivial | Broken deploys |
| 3 | Prisma + Alpine will fail to run without musl binary targets | 🔴 Critical | Trivial | Hours of confusion |
| 4 | Auth.js v5 welds authentication to Next.js | 🟠 High | Low | High |
| 5 | No offline resilience — primary use case is a live client call | 🟠 High | Low | Medium |
| 6 | Undo/redo not designed; Zustand gives you none | 🟠 High | Low | High |
| 7 | Excel template fidelity is an unvalidated assumption | 🟠 High | 2h spike | Could invalidate F9 |
| 8 | No Postgres connection pooling strategy | 🟡 Medium | Trivial | Outages under load |
| 9 | Konva gives primitives, not an editor — snapping/measurement/history are all custom | 🟡 Medium | — | — |
| 10 | Client-side PDF rasterisation of large venue maps | 🟡 Medium | Low | Medium |
| 11 | No background jobs — exports run in the request | 🟡 Medium | Low | Medium |
| 12 | "Multi-tenant from day one" with no tenant model defined | 🟡 Medium | Low | High |
| 13 | Total stack surface vs a 1-week MVP | 🟠 High | — | Missed deadline |

---

## 1. 🔴 Next.js App Router is the wrong shape — twice over

**The app-shape problem.** This product is a **single-page canvas editor**. Almost
everything of value lives in one enormous client component holding canvas state.
The App Router's entire value proposition — server components, streaming, nested
server-rendered layouts, granular caching — buys us close to nothing here. What it
*does* buy is real complexity: the RSC/client boundary, server actions, three
overlapping caching layers, and `"use client"` sprinkled everywhere.

**The platform problem.** Next.js's best features are Vercel-shaped. On Render in
Docker you lose or must hand-manage image optimisation (CPU work on your own
container), ISR and revalidation (unreliable with an ephemeral filesystem, and
inconsistent the moment you run two instances), and edge middleware.

**The handover problem — this is the one that matters.** Your dev team's language
is still unknown. With Next.js App Router and server actions, the backend logic
is *welded into the React framework*. If the team turns out to be Python or PHP,
they cannot keep the frontend and replace the backend — the two aren't separable.
They rewrite everything. That is precisely the outcome ADR-002 exists to prevent,
and the framework choice quietly undermines it.

**Recommendation: Vite + React SPA, served by a small Fastify (or Hono) API, in one container.**

```
┌─────────────────────────────────────────┐
│  Docker container on Render             │
│  ┌───────────────┐  ┌────────────────┐  │
│  │ Fastify API   │  │ Static SPA     │  │
│  │ /api/*        │  │ (Vite build)   │  │
│  └───────┬───────┘  └────────────────┘  │
└──────────┼──────────────────────────────┘
           └── Postgres · GCS
```

Why this is better *here specifically*:

- **The handover seam becomes real.** The API is a plain REST service. A Python
  or PHP team reimplements `/api/*` and keeps the entire frontend untouched. With
  Next.js that option doesn't exist.
- **Simpler and faster to build** — no RSC boundary, no caching semantics, no
  server actions. For a one-week MVP that matters a lot.
- **Docker-native.** A Vite build is static files. No standalone-output tricks,
  no ISR-on-ephemeral-disk problems.
- **Editor state is client state anyway.** We're not fighting the framework to
  admit that.
- Still entirely mainstream and hireable — React + Vite + Fastify is not exotic.

Honest counter-argument: Next.js has more training data behind it, so Cursor
generates Next.js more fluently, and "we use Next" reads as more standard to some
teams. My view is that the decoupling benefit outweighs it — but it's your call,
and it's a reasonable trade to weigh.

---

## 2. 🔴 `preDeployCommand` does not apply to Docker services *(my error)*

`infra/render.yaml` as written runs migrations via:

```yaml
preDeployCommand: npx prisma migrate deploy
```

Render's Blueprint spec states `preDeployCommand` applies to **non-Docker-based
services**. Our service *is* Docker-based. So migrations would silently never run,
and the first deploy would serve code against an empty schema.

**Fix — run migrations from the container entrypoint, guarded so concurrent
instances can't race:**

```sh
#!/bin/sh
set -e
npx prisma migrate deploy      # advisory-locked by Prisma; safe if two start at once
exec node server.js
```

Alternative: a separate Render **Job** run before deploy. The entrypoint is
simpler and adequate at our scale.

---

## 3. 🔴 Prisma on Alpine will fail without musl binary targets *(my error)*

The Dockerfile pins `node:22-alpine`. Alpine uses musl libc; Prisma ships engines
per-platform and will not find a compatible one, producing the classic
*"Query engine library for current platform could not be found"* — at **runtime**,
often only in production.

**Two fixes; take the second:**

1. Declare the target in `schema.prisma`:
   ```prisma
   generator client {
     provider      = "prisma-client-js"
     binaryTargets = ["native", "linux-musl-openssl-3.0.x"]
   }
   ```
2. **Preferred: switch the base image to `node:22-slim` (Debian).** Alpine's size
   advantage is modest once the Prisma engine is included, and it removes an
   entire class of native-module problems (sharp, canvas, bcrypt) that we're
   likely to hit anyway.

---

## 4. 🟠 Auth.js v5 couples auth to Next.js

Auth.js is excellent *inside* Next.js. Outside it, it's a poor fit. If we adopt
finding #1, Auth.js goes with it. It has also spent a long stretch in beta with
churn between v4 and v5.

**Recommendation: implement Google OIDC directly** with `openid-client`, plus an
httpOnly session cookie backed by a `sessions` table.

That's roughly 150 lines: redirect to Google → handle callback → verify the ID
token → check the `hd` claim → create a session row → set a cookie. It's
framework-agnostic, survives any backend rewrite, has no beta dependency, and is
transparent to a reviewer — which matters for the component most likely to be
audited.

---

## 5. 🟠 No offline resilience — and the primary use case is a live client call

Autosave writes to the server. If connectivity drops mid-call — hotel wifi,
tethering, a flaky venue — the salesperson loses work in front of the client. This
is the single most embarrassing possible failure for this product.

**Fix:** persist editor state to **IndexedDB** on every change, sync to the server
opportunistically, and show a clear connection indicator. Recover from local state
on reload. Cheap to add now, awkward to retrofit once state management is settled.

---

## 6. 🟠 Undo/redo needs designing, not adding

**Superseded 15 Aug 2026 by ADR-007** (`ENGINEERING-STANDARDS.md` §11). Undo is
still designed, not bolted on; the choice is now zundo (state-diff) rather than
a hand-rolled command stack. The original concern — a named, inspectable undo
that composes with multi-select — is preserved as ADR-007 consequence (a):
labels are stamped per snapshot via `handleSet`, and a bare "Undo" is a QA-20
regression. `history.ts` stays until that slice lands.

A canvas editor without reliable undo is unusable — and Zustand provides none.
Bolting it on after the fact is how you end up with undo that mostly works.

**Original fix (kept for history):** decide the approach up front. Either a
**command pattern** (every mutation is an object with `do`/`undo`) or **immer
patches** (`zundo`, or a hand-rolled patch stack). Command pattern is more work
but composes better with multi-select and grouped operations, and gives you an
audit trail for free.

---

## 7. 🟠 Excel template fidelity is an assumption, not a fact

Requirement F9.1 — reproduce your existing BOQ template exactly — is stated
confidently, but nobody has tested whether ExcelJS can round-trip *your specific*
file. Merged cells, images, conditional formatting, formulas, print areas and
named ranges all vary in how well they survive.

**Fix: a 2-hour spike the moment the template arrives.** Load it, populate it,
save it, open it in Excel and diff it visually. If ExcelJS mangles it, options are
to rebuild the template natively, use a different library, or generate the BOQ as
a PDF and a plain sheet. Better to know in hour two than on day six.

---

## 8. 🟡 No connection pooling strategy

Prisma opens a connection pool per instance. `basic-256mb` Postgres has a modest
connection limit. Two instances plus a migration job plus a local dev connection
can exhaust it, and the failure mode is opaque.

**Fix:** set an explicit `connection_limit` in `DATABASE_URL`, and add PgBouncer
if we ever scale past two instances. Also: 256 MB is small — fine for MVP, but
plan to move to `basic-1gb` once real layouts accumulate.

---

## 9. 🟡 Konva gives you primitives, not an editor

Konva provides a scene graph, a transformer and hit detection. It does **not**
provide snapping, alignment guides, measurement tools, undo, grouping semantics,
or a properties panel. All of that is ours to build. That's the right trade — but
the estimate must reflect it, and "we're using Konva" should not be mistaken for
"the editor is mostly done".

---

## 10–12 🟡 Smaller items

**PDF rasterisation** of a large architectural venue PDF in the browser can be
slow and memory-hungry. Consider rendering server-side to a tiled image, which is
also the path DXF/DWG will need later.

**No background jobs.** Export generation runs inside the HTTP request. Fine at
MVP scale; a large BOQ plus a high-resolution layout PDF could approach request
timeouts. Note it, don't build for it yet.

**Multi-tenancy is claimed but not modelled.** The charter says
"multi-tenant-ready", but there is no `organisation` entity yet. Add
`organisation_id` to every table from the first migration even while there's only
one org — adding it later means backfilling every row and every query.

---

## 13. 🟠 Stack surface versus a one-week MVP

Counting the moving parts: Next.js App Router + Auth.js + Prisma + Docker +
Render Blueprints + Konva + ExcelJS template fidelity + PDF generation + GCS
signed URLs. Each is individually reasonable; together they are a lot of first-time
integration for seven days, and integration is where the time actually goes.

Adopting findings #1 and #4 removes two of the largest unknowns.

---

## Recommended revised stack

| Layer | Current | Proposed | Why |
|---|---|---|---|
| Frontend | Next.js 15 App Router | **Vite + React + TypeScript (SPA)** | Right shape for a canvas editor; decouples from backend |
| Backend | Next.js server actions/routes | **Fastify + TypeScript REST API** | Replaceable by any language at handover |
| Auth | Auth.js v5 | **`openid-client` + session cookie** | Framework-agnostic, no beta dependency |
| Base image | `node:22-alpine` | **`node:22-slim`** | Avoids Prisma/musl and native-module pain |
| Migrations | `preDeployCommand` | **Container entrypoint** | `preDeployCommand` doesn't apply to Docker services |
| Local state | Zustand | **Zustand + explicit command-pattern history** | Undo is a design decision, not a library |
| Offline | none | **IndexedDB draft persistence** | The primary use case is a live call |

Unchanged: Konva, Tailwind + shadcn/ui, TanStack Query, Prisma, Postgres, GCS,
Docker, Render, Zod, Vitest, Playwright, Sentry, ExcelJS *(pending spike)*.

---

## What I'd do next

1. **Decide on finding #1** — it's the only one that's expensive to reverse.
2. Fix #2 and #3 in `infra/` immediately; they are defects, not opinions.
3. Run the ExcelJS spike as soon as the template arrives.
4. Add `organisation_id` to the data model from migration one.
