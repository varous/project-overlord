# Build stage: install everything, compile the three TypeScript projects.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/geo-core/package.json packages/geo-core/
COPY packages/scene/package.json packages/scene/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY tsconfig.base.json tsconfig.json ./
COPY packages/geo-core packages/geo-core
COPY packages/scene packages/scene
COPY apps/api apps/api
RUN npx tsc -b packages/geo-core packages/scene apps/api

# Runtime stage: production dependencies for the API only (no web assets, no dev tooling).
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/geo-core/package.json packages/geo-core/
COPY packages/scene/package.json packages/scene/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace @overlord/api --workspace @overlord/scene --workspace @overlord/geo-core
COPY --from=build /app/packages/geo-core/dist packages/geo-core/dist
COPY --from=build /app/packages/scene/dist packages/scene/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/migrations apps/api/migrations

# Run as the image's non-root `node` user.
USER node
EXPOSE 8080
CMD ["node", "apps/api/dist/server.js"]
