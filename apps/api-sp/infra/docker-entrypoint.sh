#!/bin/sh
set -e

# Migrations run HERE, not via render.yaml's preDeployCommand.
#
# Render's Blueprint spec applies preDeployCommand to non-Docker services only.
# Our service is Docker-based, so a preDeployCommand would silently never run
# and the first deploy would serve code against an empty schema.
# See docs/06-stack-review.md finding #2.
#
# prisma migrate deploy takes a Postgres advisory lock, so two instances
# starting simultaneously is safe.
echo "[entrypoint] applying migrations"
npx prisma migrate deploy --schema packages/api/prisma/schema.prisma

echo "[entrypoint] starting: $*"
exec "$@"
