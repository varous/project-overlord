# syntax=docker/dockerfile:1
#
# node:22-slim (Debian), NOT alpine. Prisma ships per-platform query engines and
# musl needs a separate binaryTarget; slim also removes a whole class of native
# module problems (sharp, canvas, bcrypt) we are likely to hit.
# See docs/06-stack-review.md finding #3.

# ---------- build ----------
FROM node:22-slim AS build
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/domain/package.json packages/domain/
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
RUN npm ci

COPY . .
RUN npx prisma generate --schema packages/api/prisma/schema.prisma
RUN npm run build

# ---------- runtime ----------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends openssl curl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
COPY packages/domain/package.json packages/domain/
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
RUN npm ci --omit=dev

COPY --from=build /app/packages/domain/dist packages/domain/dist
COPY --from=build /app/packages/api/dist    packages/api/dist
COPY --from=build /app/packages/web/dist    packages/web/dist
COPY --from=build /app/node_modules/.prisma node_modules/.prisma
COPY packages/api/prisma packages/api/prisma
# Seed JSON lives here so `import-catalogue` can run in the container. The
# bundle is ~330 KB; leaving it out boots a live site against an empty palette.
COPY packages/api/seed packages/api/seed
COPY infra/docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Never run as root.
USER node

EXPOSE 8080

# Probes the process, not the database - a DB blip must not kill the container.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8080/healthz || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "packages/api/dist/server.js"]
