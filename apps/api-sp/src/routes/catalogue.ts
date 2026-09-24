import type { FastifyInstance } from "fastify";
import { db } from "../lib/db.js";
import { requireUser } from "../lib/session.js";
import { toPackageDto } from "../lib/catalogue-dto.js";

/**
 * Read-only catalogue for the editor palette.
 * No money field exists in the payload — rates belong to QuoteOS.
 */
export async function catalogueRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireUser);

  app.get("/packages", async (_req, reply) => {
    const [rows, showRows] = await Promise.all([
      db.packageTemplate.findMany({
        orderBy: { name: "asc" },
        include: {
          lines: {
            include: {
              item: { select: { name: true, category: true } },
            },
          },
        },
      }),
      db.item.findMany({
        where: { placement: "SHOW" },
        orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
        select: { code: true, name: true, category: true, unit: true },
      }),
    ]);
    return reply.send({
      packages: rows.map(toPackageDto),
      showItems: showRows,
    });
  });
}
