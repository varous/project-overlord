#!/bin/sh
set -e

# Migrations run HERE, not via render.yaml's preDeployCommand.
#
# Render's Blueprint spec applies preDeployCommand to non-Docker services only.
# This service is Docker-based, so a preDeployCommand would silently never run
# and the first deploy would serve code against an empty schema.
# prisma migrate deploy takes a Postgres advisory lock, so two instances
# starting simultaneously is safe.
#
# DB_SCHEMA: the editor shares project-overlord-db but isolates itself in its own
# Postgres schema. The schema must be in DATABASE_URL for BOTH `migrate deploy`
# and the running server, or migrations land in one schema and queries in another.
# The composition lives in apps/api-sp/src/lib/db-url.ts (unit-tested); this
# script calls that one implementation via node rather than re-implementing it.
if [ -n "${DB_SCHEMA:-}" ] && [ -n "${DATABASE_URL:-}" ]; then
  DATABASE_URL="$(node --input-type=module -e "const m = await import('./apps/api-sp/dist/lib/db-url.js'); process.stdout.write(m.withSchema(process.env.DATABASE_URL ?? '', process.env.DB_SCHEMA));")"
  export DATABASE_URL
  echo "[entrypoint] DATABASE_URL bound to schema '${DB_SCHEMA}'"
fi

echo "[entrypoint] applying migrations"
node node_modules/prisma/build/index.js migrate deploy --schema apps/api-sp/prisma/schema.prisma

echo "[entrypoint] starting: $*"
exec "$@"
