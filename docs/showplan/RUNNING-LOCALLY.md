# Running ShowPlan locally

Monorepo: API on **:8080**, Vite SPA on **:5173** (proxies `/api`, `/healthz`, `/readyz`).

## One-time setup

```bash
npm install
git config core.hooksPath .githooks   # refuses direct pushes to main
cp .env.example .env                  # fill Google + SESSION_SECRET + R2; never commit .env
docker compose -f infra/docker-compose.yml up -d db
npm run prisma:migrate
npm run build --workspace @showplan/domain
npm run import:catalogue --workspace @showplan/api -- seed
```

Google Cloud OAuth redirect URI (exact):

```
http://localhost:8080/api/auth/callback
```

## Every day

```bash
docker compose -f infra/docker-compose.yml up -d db
npm run dev --workspace @showplan/api &
npm run dev --workspace @showplan/web
```

Open **http://localhost:5173/** — not :8080 (the API does not serve the SPA in development).

Confirm API: `curl -s http://localhost:8080/healthz` → `{"ok":true}`.

## Cloudflare R2 (base-map uploads)

Public access on the bucket is **disabled**. Every write is a **presigned PUT**
from the browser; every read is a **presigned GET** (Konva / `<img>`). Bytes never
pass through the app server.

### Local vs production

| | Local | Production |
|---|---|---|
| Bucket | `showplan-dev` | **separate** prod bucket (do not reuse `showplan-dev`) |
| API token | object read/write on `showplan-dev` only | **separate** token scoped to the prod bucket only |
| Web origin in CORS | `http://localhost:5173` | the real HTTPS app origin |

Prod credentials live in Render → Environment. Never copy the local token into
prod, and never point local `.env` at the prod bucket.

### Token scope (by design)

The R2 API token is **object read/write** on one bucket. It must **not** be able
to create or list buckets. App code only uses object ops: `PutObject` /
`GetObject` / `HeadObject` / `DeleteObject` via presigned URLs or the SDK.
If a feature seems to need `CreateBucket`, `ListBuckets`, or bucket-wide
`ListObjects`, that is a **design problem** — change the design, do not widen
the token.

### CORS (bucket settings)

Allow for the local web origin:

- Methods: `GET`, `PUT` (and `HEAD` / `OPTIONS` as Cloudflare requires for preflight)
- Allowed headers: **`Content-Type` only**
- Origins: `http://localhost:5173` (add the prod origin on the prod bucket)

The client sets **only** `Content-Type` on upload. It does **not** set
`Content-Length` from JavaScript (the browser sets length automatically). Signing
or requiring `Content-Length` breaks this CORS policy.

If a browser upload fails CORS, read the preflight response: note the exact
blocked **header** or **method** before changing the policy. Do not widen CORS
“just in case”.

### Verify the live round trip (optional)

With `.env` filled (values never printed by the script):

```bash
npx tsx packages/api/scripts/verify-r2-roundtrip.ts
```

This hits the real `showplan-dev` bucket (presign → PUT → HeadObject → GET →
cleanup). **`npm test` stubs `r2.ts` and never touches R2.**

## Named failure modes (already paid for)

### 1. `invalid or missing environment variables: …`

**Cause:** the API reads `process.env`. Workspace `npm run` does **not** auto-load
the monorepo-root `.env`. Early boots failed until env was sourced by hand.

**Fix (in code now):** `packages/api/src/config.ts` loads root `.env` via `dotenv`
when `NODE_ENV !== "production"` (`override: false`). Production (Render) injects
vars and is never overridden by a file.

Config still prints **key names only** on failure — never values.

### 2. `unable to determine transport target for "pino-pretty"`

**Cause:** Fastify’s debug logger used `transport: { target: "pino-pretty" }` but
`pino-pretty` was not installed. Boot crashed in development.

**Fix:** `pino-pretty` is an **api `devDependency`**. Pretty transport is used only
when `NODE_ENV !== "production"`. Production logs stay JSON and never require the
dev package.

### 3. Lint red on `_to_delete/`

**Cause:** scratch folder is gitignored but was still linted.

**Fix:** `"_to_delete/**"` in `eslint.config.js` `ignores`.

### 4. Google sign-in loops / callback mismatch

Register exactly `http://localhost:8080/api/auth/callback` (no `/google` suffix).
Hosted-domain gate is `ALLOWED_HD` (server-side).

### 5. `r2_not_configured` (503) on upload

**Cause:** one or more `R2_*` keys missing/empty. Message names the keys.

**Fix:** fill `.env` from Cloudflare (see `.env.example` comments). Restart the API.

### 6. Browser PUT fails CORS (curl still works)

**Symptom:** Upload from the SPA fails; the same presigned URL works with
`curl` or a server-side fetch. That split means **CORS preflight**, not bad
keys.

**Cause:** The client (or the signed PutObject) required a header the bucket
CORS policy does not allow. On day one that was **`Content-Length`** while the
allowlist was **`Content-Type` only**.

**Rejected fix:** Widening the allowlist to include `Content-Length` or `*`.
Wrong — the browser already sends length; prod would inherit the same trap.

**Fix:** Sign and set **`Content-Type` only** (`packages/api/src/lib/r2.ts`).
If it fails again, read the preflight: name the exact blocked header or method,
then decide — do not open CORS “just in case”. Apply the same tight policy on
the **prod** bucket.

## Smoke checklist

1. `/healthz` and `/readyz` ok  
2. Sign in with a `@clockwork-av.com` Google account  
3. Empty projects dashboard → create with name only → lands in editor  
4. Projects → resume / Archive (no delete)  
5. Upload a venue plan → object lands in R2 → plan appears on the canvas  
6. Set scale (two clicks + distance) → survives reload

Production (Render) is a different document: [`RUNNING-IN-PRODUCTION.md`](./RUNNING-IN-PRODUCTION.md). The live image must include `packages/api/seed`; migrations do not load the catalogue.
