# Engineering Standards — Organisation-wide

> **Status:** Active · **Applies to:** all projects unless explicitly overridden
> **Owner:** Joyjeet Panday · **Last updated:** 15 Aug 2026
>
> This is the **source of truth** for deployment, containerisation, authentication
> and configuration across every project. A project may deviate only with a
> recorded ADR explaining why.

---

## 1. The standard at a glance

| Concern | Standard | Non-negotiable? |
|---|---|---|
| **Hosting / deployment** | [Render](https://dashboard.render.com/) | Yes |
| **Packaging** | Docker — every build containerised | Yes |
| **Authentication** | Google OAuth via [Google Cloud Console](https://console.cloud.google.com/) | Yes |
| **Configuration** | All env vars set in Render Environment (never committed) | Yes |
| **Database** | Render Postgres (managed) | Default |
| **Object storage** | Google Cloud Storage | Default |
| **Source control** | GitHub. `feature → dev-mac → main`; auto-deploy from `main` | Default |

---

## 2. Deployment — Render

All services deploy to Render as **Docker web services**, defined in code via a
`render.yaml` Blueprint so environments are reproducible rather than
hand-clicked in a dashboard.

### 2.1 Free tier limitations you must plan around

Verified against Render's documentation:

| Limitation | Consequence |
|---|---|
| Free web services **spin down after 15 minutes** of inactivity and take **~1 minute** to wake | Unacceptable for anything customer-facing or used live in meetings |
| Free Postgres **expires 30 days after creation** (14-day grace period) | **Data loss on a timer.** Never use free Postgres for real data |
| Free Postgres capped at **1 GB**, one per workspace | Fine for prototypes only |

**Standard:** any project holding real data or used in front of a customer runs
on **paid instance types for both the web service and Postgres**. Prototypes and
throwaway spikes may use free tiers, and must be labelled as disposable.

### 2.2 Required Render configuration

- Deploy from `main` via Blueprint (`render.yaml`), not manual dashboard setup.
  `main` receives merges only from `dev-mac` (staging) — never directly from a
  feature branch
- Health check endpoint on every service: **`/healthz`** for liveness (no database
  call — a DB blip must not kill the container) and **`/readyz`** for readiness
- Auto-deploy on push to `main`. **Preview environments are opt-in, not standard:**
  they require a Pro workspace and each preview bills as a full service plus
  datastore, prorated by the second. Enable them for a specific comparison and set
  `expireAfterDays` so an abandoned PR cannot bill quietly
- Region chosen for user proximity (Singapore for India-based users)
- Daily automated Postgres backups enabled

---

## 3. Containerisation — Docker

**Every build is containerised.** No "works on my machine", no platform-specific
build steps, and — critically for us — no lock-in to a single hosting provider.
If Render is ever the wrong answer, a container runs anywhere.

### 3.1 Dockerfile requirements

- **Multi-stage builds.** Dependencies → build → minimal runtime image.
- **Non-root user** in the runtime stage.
- Pin the base image to a **specific minor version** (`node:22-alpine`, not `node:latest`).
- `.dockerignore` excluding `node_modules`, `.git`, `.env*`, test output.
- Layer ordering optimised for cache: copy manifests and install *before* copying source.
- `HEALTHCHECK` defined.
- Target: production image **under 500 MB**.

### 3.2 Local development

`docker-compose.yml` brings up the full stack — app plus Postgres — with one
command, so a new developer is running locally within minutes and the incoming
dev team doesn't need a setup ritual.

---

## 4. Authentication — Google OAuth

Authentication uses **Google OAuth 2.0** credentials created in the
[Google Cloud Console](https://console.cloud.google.com/).

### 4.1 One Google Cloud project per application

**Each application gets its own Google Cloud project.** Do not reuse another
product's project for a new app.

Rationale: credentials, OAuth consent screen, quotas, audit logs and IAM are all
scoped to the project. Sharing one project across products means a leaked secret
or a quota problem in one app affects the others, and revoking access for a
decommissioned product means untangling shared credentials.

Naming convention: `proj-<product-slug>` (e.g. `proj-showplan`).

### 4.2 Creating credentials

1. [Google Cloud Console](https://console.cloud.google.com/) → create a new
   project for this application
2. **APIs & Services → OAuth consent screen** → configure. Set to **Internal**
   while the app is company-only; this restricts sign-in to your Google Workspace
   automatically, in addition to our own `hd` check
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
4. Application type: **Web application**
5. Register the redirect URIs for every environment (below)
6. Copy the Client ID and Client Secret **straight into Render Environment** and
   your local gitignored `.env`

Authorised redirect URIs — **path shape depends on the app**:

ShowPlan (Fastify + `openid-client` — this repo):
```
http://localhost:8080/api/auth/callback              # local API
https://<render-host>/api/auth/callback              # production (add at deploy)
```

Next.js apps using Auth.js (other Clockwork products — org default):
```
http://localhost:3000/api/auth/callback/google       # local
https://<service>-pr-<n>.onrender.com/api/auth/callback/google   # preview
https://<your-domain>/api/auth/callback/google       # production
```

Do **not** register an Auth.js-shaped `/callback/google` URI for ShowPlan — that
implies a library we do not use and will confuse whoever wires the console.

### 4.3 Handling the credentials — important

> **Never paste the client secret into a chat, a ticket, a commit, or a
> screenshot.** Put it directly into Render's Environment settings and your local
> `.env` file (which is gitignored). If a secret is ever exposed, rotate it in the
> Google Cloud Console immediately rather than hoping it went unnoticed.

### 4.4 Implementation standard

- **Next.js products:** Auth.js (NextAuth v5) with the Google provider
- **ShowPlan (this repo):** Google OIDC via `openid-client` + httpOnly session
  cookie in Postgres — deliberately not Auth.js (see `06-stack-review.md` #4)
- Sessions persisted in Postgres (not JWT-only), so sessions can be revoked
- Restrict internal tools to the company Google Workspace domain by validating
  the `hd` (hosted domain) claim — checked **server-side**, never trusted from
  the client. ShowPlan: `ALLOWED_HD=clockwork-av.com`
- Application roles live in **our** database, not in Google. Google proves *who
  you are*; we decide *what you may do*

---

## 5. Configuration & secrets

- **All environment variables are set in Render Environment.** Nothing sensitive
  is ever committed.
- Every repository ships a **`.env.example`** listing every required variable
  with a description and a safe dummy value. This file is the contract — if a new
  variable is added and `.env.example` isn't updated, the PR is incomplete.
- Validate environment variables **at application startup** with Zod and fail
  loudly. A missing variable should crash on boot with a clear message, not
  surface as a mysterious runtime error hours later.
- Use Render **Environment Groups** to share common variables across services.
- Never log secrets. Redact tokens in error reporting.

### Standard variable names

```bash
NODE_ENV=production
DATABASE_URL=postgresql://...              # provided by Render
AUTH_SECRET=                               # openssl rand -base64 32
AUTH_URL=https://your-app.onrender.com
AUTH_GOOGLE_ID=                            # from Google Cloud Console
AUTH_GOOGLE_SECRET=                        # from Google Cloud Console — never commit
ALLOWED_EMAIL_DOMAIN=yourcompany.com       # internal-only gate
GCS_BUCKET=
GCS_SERVICE_ACCOUNT_KEY=                   # JSON, base64-encoded
SENTRY_DSN=
```

---

## 6. Database

- **Render Postgres**, managed, paid tier for anything real.
- Schema changes are **always** version-controlled migration files. Never edit
  schema by hand in a dashboard.
- Migrations must be **backwards-compatible for one release** (expand → migrate →
  contract) so a rollback never strands the database ahead of the code.
- Automated daily backups; restore procedure tested at least once, not assumed.
- Row-Level Security or equivalent application-level tenant isolation from day one.

**ORM standard: Prisma.** Chosen for migration tooling, type safety, the size of
its talent pool, and strong AI-assistant support — all of which matter for
handover. Drizzle is an acceptable alternative for performance-critical services
if recorded in an ADR.

---

## 7. Object storage

**Google Cloud Storage**, in the same Google Cloud project as the OAuth
credentials. Render has no native object storage, and container filesystems are
ephemeral — never write user uploads to local disk.

- Uploads go direct to GCS using **signed URLs** so large files never pass
  through the application server
- Buckets are private by default; access is granted via short-lived signed URLs
- Restrict by MIME type and size at the point the signed URL is issued

---

## 8. CI/CD

GitHub Actions on every pull request — into `dev-mac` and into `main` alike:
typecheck → lint → unit tests → **Docker build** → e2e tests. Merging to `main`
triggers the Render deploy; merging to `dev-mac` does not deploy anywhere, because
staging is a branch you run locally, not a hosted environment.

Build the Docker image in CI, not just at deploy time — a container that only
breaks on Render is discovered far too late.

---

## 9. Observability

- **Sentry** for error tracking, with the release version tagged
- Structured JSON logging to stdout (Render captures it)
- `/healthz` returning process liveness (**no database call** — a DB blip must not
  kill the container) and `/readyz` returning database connectivity
- Alerting on deploy failure and error-rate spikes

---

## 10. Project bootstrap checklist

For every new project:

- [ ] GitHub repository created; `main` protected, `dev-mac` created as the default base branch
- [ ] `Dockerfile` (multi-stage, non-root) and `.dockerignore`
- [ ] `docker-compose.yml` for local development
- [ ] `render.yaml` Blueprint committed
- [ ] Dedicated Google Cloud project created (`proj-<product-slug>`)
- [ ] OAuth consent screen configured (Internal while company-only)
- [ ] OAuth client ID created, redirect URIs registered for all environments
- [ ] Render service + Postgres created on **paid** tiers if data is real
- [ ] Environment variables set in Render; `.env.example` committed
- [ ] Startup env validation wired up
- [ ] `/healthz` and `/readyz` implemented
- [ ] GitHub Actions CI running typecheck, lint, tests, Docker build
- [ ] Sentry connected
- [ ] Database backups enabled
- [ ] `README.md` with local setup in under 10 commands
- [ ] `docs/` folder with charter, PRD, architecture

---

## 11. ADR-007 — Adopt headless UI libraries (ShowPlan)

**Status:** Accepted · **Date:** 15 Aug 2026 · **Applies to:** ShowPlan (`packages/web`)

This ADR is ShowPlan-specific. Other Clockwork products keep their own UI
stack. The numbered ADR entries 001–006 live in `02-architecture-and-stack.md`; 007
is recorded here because it is an engineering standard for this repo's chrome,
then restamped on the architecture doc.

### Decision

All UI chrome behavior comes from established headless libraries, styled with
existing design-system.css classes. Do NOT hand-roll focus management, menu
keyboard navigation, dialog behavior, undo stacks, or hotkey handling.

Adopted:

- `@radix-ui/react-*`: Menubar (app menu bar), DropdownMenu (view-bar
  selects), ContextMenu (canvas right-click), Dialog + AlertDialog (export,
  blast-radius confirm), Popover, Tooltip, Tabs, ToggleGroup (2D/3D and
  theme segmented controls), Slider, Switch, Checkbox, ScrollArea
- zustand + zundo — editor state and undo/redo history
- react-hotkeys-hook — keyboard shortcuts
- cmdk — Quick Search / command palette (Cmd-K)
- react-resizable-panels — panel layout splits
- dnd-kit — palette-to-canvas drag interactions
- sonner — toasts
- Konva.Transformer — on-canvas selection handles, rotate, resize,
  snapping. Do not reimplement transform handles manually.

Rules:

1. Behavior from the library, visuals from design-system.css. Map our
   classes onto Radix parts (`.select` on Trigger, `.tooltip` on Content).
   Never accept a library's default styling. Do not add Tailwind.
2. Retrofit opportunistically: any slice that touches a control rebuilds
   that control on these primitives. Do NOT pause feature work for a
   big-bang rewrite of chrome that already passes QA.
3. The `CanvasMode` discriminated union and ALL domain logic stay exactly
   as-is. This covers interaction plumbing only.
4. Radix keyboard/focus behavior is the accessibility baseline. Every
   interactive control gets a visible `:focus-visible` ring using the ink
   ring pattern from the design system.

The canvas engine remains Konva — unchanged by this directive.

### Consequences — acceptance criteria for later slices, not optional caveats

**(a) Undo labels must survive.** `packages/web/src/lib/history.ts` is a command
stack where every `Command` carries a human label, and QA-20 made undo/redo
announce "Undo Move 3 elements". zundo is state-diff based and has no action
name. When undo migrates, use zundo's `handleSet` to stamp a label per
snapshot and keep the accessible name format exactly as it is today. A
migration that leaves a bare "Undo" is a QA-20 regression and fails review.
Until that slice lands, `history.ts` stays — do not delete it.

**(b) dnd-kit does not solve the drop.** It is DOM-based; the drop target is a
Konva stage with its own coordinate space, zoom and pan. Converting a
pointer position into stage coordinates remains our code. Check for
sensor conflicts with Konva's pointer handling before committing to it
for canvas drops. It is adopted for the palette-side affordance and
keyboard-accessible dragging.

**(c) The QA-24 check will go blind.** `scripts/qa-no-handler.mjs` greps
components for enabled chrome with no handler. Radix moves handlers to
`onSelect` / `onValueChange` on different parts, so the grep will pass
while seeing nothing. Every slice that migrates a control MUST update
that script in the same PR. This is on the pull-request template.

**(d) Disabled items leave the focus order.** Radix skips disabled items during
keyboard navigation. Our capability-flag pattern keeps every V2 slot
rendered and disabled in place; that still holds visually. Accept
Radix's focus behavior as correct and record the change.

**(e) The calibration dialog is deliberately not modal.** `.cal-dialog` is a
floating panel so the venue plan stays visible while calibrating. Radix
Dialog is modal by default — focus trap, scroll lock, inert background.
When it migrates, use `modal={false}` or Popover. A modal calibration
dialog is a regression and fails review.

**(f) The bundle ceiling is a budget, not a changelog.** The measured
"after install" figure equals the "before" figure only because nothing
imports the new packages yet. It is not evidence the adoption is free.
Radix's first primitive carries shared infrastructure — portal, popper,
focus scope, dismissable layer — that DropdownMenu, ContextMenu, Dialog,
Popover and Tooltip all reuse, so the marginal cost of later primitives
is small. Projected total once every ADR-007 library is imported is
~380–395 KB gzip. Ceiling: **400,000 B** (~2s on 1.5 Mbps venue Wi-Fi,
cold cache, about once per salesperson per day). That number was raised
once, from 320,000. Do not raise it incrementally per PR. A rise above
400,000 is a design conversation, not a bump.

cmdk (Cmd-K palette) and Konva.Transformer (transform handles) do not exist
in the app today, so rule 2 will never trigger them. They are their own
slices in `docs/09-phased-plan.md`. Do not build them in the ADR PR.

`docs/06-stack-review.md` finding #6 argued for a hand-rolled command stack
over patch-based undo. That finding is superseded by this ADR. The original
concern (named, inspectable undo that composes with multi-select) is
preserved by consequence (a), not discarded.

### Bundle size (measured 15 Aug 2026)

The app loads over venue Wi-Fi during a live client call. Growth must be
visible in `npm run status`, not discovered on a call.

Definition: gzip -9 of `packages/web/dist` JS/CSS, excluding source maps and
the pdf.js worker (already 374,027 B gzip, unrelated to chrome).

| When | Gzipped JS+CSS |
|---|---|
| **Before** adding the dependencies | **289,043 B (282.3 KiB)** |
| **After** adding the dependencies (nothing imported yet) | **289,043 B (282.3 KiB)** |
| **After** first primitive (`@radix-ui/react-menubar`) | **319,303 B (311.8 KiB)** |

Vite tree-shakes unused packages, so the install alone does not grow the
shipped file. That equality is not evidence adoption is free — see
consequence (f). Ceiling in `scripts/gzip-web-bundle.mjs`: **400,000 B**.
Raised once from 320,000 after the menubar import. Do not raise it
incrementally per PR. A rise above 400,000 is a design conversation.

### Licenses (verified from each package's GitHub LICENSE, 15 Aug 2026)

Not assumed from a directive. Each row is the LICENSE file in that repo.

| Package | Installed | License | Repo LICENSE |
|---|---|---|---|
| `@radix-ui/react-*` (13 primitives) | 1.1–2.3 as resolved | MIT | [radix-ui/primitives](https://github.com/radix-ui/primitives/blob/main/LICENSE) |
| `zundo` | 2.3.0 (zustand `^5` compatible from 2.3.0) | MIT | [charkour/zundo](https://github.com/charkour/zundo/blob/main/LICENSE) |
| `zustand` | already `^5` (5.0.14 resolved) | MIT | [pmndrs/zustand](https://github.com/pmndrs/zustand/blob/main/LICENSE) |
| `react-hotkeys-hook` | 5.3.3 | MIT | [JohannesKlauss/react-hotkeys-hook](https://github.com/JohannesKlauss/react-hotkeys-hook/blob/main/LICENSE) |
| `cmdk` | 1.1.1 | MIT | [pacocoursey/cmdk](https://github.com/pacocoursey/cmdk/blob/main/LICENSE.md) |
| `react-resizable-panels` | 4.12.2 | MIT | [bvaughn/react-resizable-panels](https://github.com/bvaughn/react-resizable-panels/blob/main/LICENSE.md) |
| `@dnd-kit/core` / `@dnd-kit/utilities` | 6.3.1 / 3.2.2 | MIT | [clauderic/dnd-kit](https://github.com/clauderic/dnd-kit/blob/master/LICENSE) |
| `sonner` | 2.0.8 | MIT | [emilkowalski/sonner](https://github.com/emilkowalski/sonner/blob/main/LICENSE.md) |
| Konva.Transformer | already in `konva` | (existing dep, not added here) | — |

No control is migrated in the ADR PR. Dependencies are installed so later
slices can import them; chrome stays as it is.

---

## 12. Deviations

Any deviation from this document requires an ADR in the project's
`docs/02-architecture-and-stack.md` stating what was done differently and why.
Deviating is allowed. Deviating silently is not.
