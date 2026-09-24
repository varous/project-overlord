# ShowPlan

Import a venue plan, calibrate its scale, lay out the show, export a BOQ —
during the client call.

Internal tool for **Clockwork AV**. Working title; see `docs/05-open-questions.md`.

## Quick start

```bash
npm install
cp .env.example .env                                   # then fill it in
docker compose -f infra/docker-compose.yml up -d db    # Postgres on :5432
npm run prisma:migrate                                 # first run creates the schema
npm run dev                                            # api :8080 · web :5173
```

Open http://localhost:5173. The status bar bottom-right should read
`showplan 0.1.0 · local · db up`. If it says `unreachable`, the API isn't running;
if it says `db down`, Postgres isn't.

## What's built

Slice 0 — the walking skeleton. It proves the container serves the SPA, the SPA
reaches the API, and the API reaches Postgres, and it puts the real shell and the
real design tokens on screen. Everything else is a feature on top of a deployment
that already works.

```
packages/domain   units · money · geometry · scale calibration · measurement types
                  17 tests, zero runtime dependencies
packages/api      Fastify, health probes, Prisma schema
packages/web      Vite + React shell built from the Figma reference
infra             Dockerfile, entrypoint, render.yaml, compose
docs              charter, PRD, ADRs, research, phased plan
```

## Deploying

Push to the repo Render is watching. `infra/render.yaml` pins the plans
deliberately — read the comments before changing them, and read
`docs/11-deployment-cost-plan.md` before changing them anyway. Running cost is
**$13/month**.

DNS: CNAME `layout.clockwork-av.com` to the Render host, the same way
`quotes.clockwork-av.com` is routed today. Render handles TLS at no cost.

## Read next

`CLAUDE.md` for the working agreement and the non-negotiables.
`docs/README.md` for the full documentation set.
