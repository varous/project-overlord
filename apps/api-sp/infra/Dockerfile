# syntax=docker/dockerfile:1
#
# The ShowPlan editor service (apps/api-sp), deployed as Render service
# `overlord-editor`. It serves its OWN web-sp static build from the same origin:
# api-sp signs users in with a session cookie, and a Pages frontend calling an
# onrender.com API would need third-party cookies, which browsers block. See
# docs/runbooks/editor-deploy.md.
#
# node:24-slim (Debian), NOT alpine — matches .nvmrc, and Prisma ships per-
# platform query engines (musl would need a separate binaryTarget).
#
# Build context is the repository root (render.yaml: dockerContext ".").

# ---------- build ----------
FROM node:24-slim AS build
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./
COPY packages/boq/package.json packages/boq/
COPY apps/api-sp/package.json apps/api-sp/
COPY apps/web-sp/package.json apps/web-sp/
RUN npm ci

# The whole package/app source tree: web-sp's build resolves the root tsconfig's
# project references, so the other packages must be present to be loadable. Only
# the boq/web-sp/api-sp workspaces are built below.
COPY packages packages
COPY apps apps

RUN npx prisma generate --schema apps/api-sp/prisma/schema.prisma
RUN npm run build -w @overlord/boq
RUN npm run build -w @overlord/web-sp
RUN npm run build -w @overlord/api-sp

# ---------- runtime ----------
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends openssl curl \
  && rm -rf /var/lib/apt/lists/*

# Production dependencies for the server and its one workspace dependency.
COPY package.json package-lock.json ./
COPY packages/boq/package.json packages/boq/
COPY apps/api-sp/package.json apps/api-sp/
COPY apps/web-sp/package.json apps/web-sp/
RUN npm ci --omit=dev --workspace @overlord/api-sp --workspace @overlord/boq

# The generated Prisma client and the CLI needed for `migrate deploy` at boot.
# (prisma is a root devDependency; the runtime install omits devDependencies.)
COPY --from=build /app/node_modules/.prisma node_modules/.prisma
COPY --from=build /app/node_modules/@prisma node_modules/@prisma
COPY --from=build /app/node_modules/prisma node_modules/prisma

COPY --from=build /app/packages/boq/dist packages/boq/dist
COPY --from=build /app/apps/api-sp/dist apps/api-sp/dist
COPY --from=build /app/apps/web-sp/dist apps/web-sp/dist
COPY apps/api-sp/prisma apps/api-sp/prisma
COPY apps/api-sp/infra/docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Never run as root. (The image's built-in `node` user.)
USER node

EXPOSE 8080

# Probes the process, not the database — a DB blip must not kill the container.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8080/healthz || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "apps/api-sp/dist/server.js"]
