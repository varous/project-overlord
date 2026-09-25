import { fileURLToPath } from "node:url";
import path from "node:path";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import { config, isProd } from "./config.js";
import { registerRoutes } from "./routes/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The editor (web-sp) build served from this service's own origin.
 *
 * Same origin is not cosmetic: api-sp signs users in with a session cookie, and
 * a Pages frontend calling an onrender.com API would need third-party cookies,
 * which browsers block. So api-sp serves the web-sp build itself.
 *
 * `here` is this file's dir (apps/api-sp/{src|dist}); two levels up is `apps/`.
 * Exported so a test can prove it is web-sp's build, not the Cesium viewer's.
 */
export function webRootDir(): string {
  return path.resolve(here, "../../web-sp/dist");
}

/**
 * Build the Fastify app without listening. Tests call this; server.ts listens.
 */
export async function buildApp(opts?: {
  logger?: boolean | object;
}): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      opts?.logger !== undefined
        ? opts.logger
        : isProd
          ? { level: "info" }
          : {
              level: "debug",
              /* Dev-only. A missing pino-pretty must never crash production JSON logs. */
              transport: { target: "pino-pretty" },
            },
    trustProxy: isProd,
    bodyLimit: 2 * 1024 * 1024,
  });

  await app.register(cookie, { secret: config.SESSION_SECRET });
  await registerRoutes(app);

  if (isProd) {
    const webRoot = webRootDir();
    // index:false made GET / 403 (directory match); send never 404s that path
    // so the SPA fallback never ran. Deep links still 404 → callNotFound.
    await app.register(fastifyStatic, { root: webRoot, index: ["index.html"] });

    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) {
        return reply.code(404).send({ error: "not_found" });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}
