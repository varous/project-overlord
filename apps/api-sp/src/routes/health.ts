import type { FastifyInstance } from "fastify";
import { db } from "../lib/db.js";

/**
 * Two endpoints, deliberately different:
 *   /healthz  - is the process up? Used by Docker HEALTHCHECK. No DB call, so a
 *               database blip does not cause the container to be killed.
 *   /readyz   - can we actually serve traffic? Checks the DB.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/healthz", async () => ({ ok: true }));

  app.get("/readyz", async (_req, reply) => {
    try {
      await db.$queryRaw`SELECT 1`;
      return { ok: true, db: "up" };
    } catch {
      return reply.code(503).send({ ok: false, db: "down" });
    }
  });
}
