# Running the API

The scene API (`apps/api`, package `@overlord/api`) is a Fastify service that persists scenes,
versions and share links in Postgres. It validates scene documents with the exact same code the
browser uses (`@overlord/scene`), so there is a single source of truth for the rules.

## Local run with Docker Compose

```bash
docker compose -f infra/docker-compose.yml up -d
export TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres
npm test                                   # API integration tests now run against real Postgres

# Run the server itself (migrations run automatically at startup):
export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres
export OVERLORD_API_TOKEN=dev-token
export NODE_ENV=development                # CORS_ORIGINS defaults to "*" in development
npm run dev -w @overlord/api               # tsx watch, or:
npm run build -w @overlord/api && npm run start -w @overlord/api
```

The integration tests create a throwaway database per test file, apply the migrations, run, and
drop the database afterwards. If `TEST_DATABASE_URL` is unset, those tests skip with a message, so
`make verify` still passes on a machine without a database.

## Migration model

Migrations are plain SQL files in `apps/api/migrations/`, applied in filename order, each inside its
own transaction, and recorded in the `schema_migrations` table (filename, applied_at). A file that is
already recorded is skipped. **Once a migration has been applied anywhere, never edit it** — add a new
file (`0002_*.sql`, `0003_*.sql`, …) instead. The server runs all pending migrations at startup,
before it begins listening.

## Deploying on Render

The blueprint is `render.yaml` at the repository root (Render only reads a root-level blueprint).
Link the repo, then apply it:

```bash
render blueprint apply
```

It provisions one Docker web service (Starter, Singapore) and one Postgres database
(basic-256mb, Singapore). Before the first deploy, set `OVERLORD_API_TOKEN` in the Render dashboard
(it is declared with `sync: false`, so the blueprint never changes it). Render injects
`RENDER_GIT_COMMIT`, which the API reports as the `commit` in `/health`.

## Rotating OVERLORD_API_TOKEN

1. Generate a new token (e.g. `openssl rand -hex 32`).
2. In the Render dashboard, update the `OVERLORD_API_TOKEN` environment variable on the
   `project-overlord-api` service.
3. Redeploy (Render restarts the service on env changes).
4. Update any caller that uses the old token. The old token stops working the moment the service
   restarts.
