import type { FastifyInstance } from "fastify";
import { requireUser } from "../lib/session.js";
import { computeLiveBoq } from "../lib/boq-project.js";

/**
 * GET /api/projects/:projectId/boq — the layout's bill of quantities.
 *
 * Quantities only. There is no money field on this payload: rates belong to
 * QuoteOS. An uncalibrated layout yields findings that explain what is missing;
 * no quantity is invented.
 */
export async function boqRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireUser);

  app.get("/:projectId/boq", async (req, reply) => {
    const user = req.user!;
    const { projectId } = req.params as { projectId: string };

    const computed = await computeLiveBoq(projectId, user);
    if (!computed.ok) {
      return reply.code(computed.status).send({
        error: computed.error,
        message: computed.message,
        ...(computed.reason ? { reason: computed.reason } : {}),
      });
    }

    return reply.send({
      catalogueVersion: computed.catalogueVersionLabel,
      lines: computed.boq.lines.map((l) => ({
        itemCode: l.itemCode,
        name: l.item.name,
        unit: l.item.unit,
        qtyBasis: l.item.qtyBasis,
        section: l.item.section,
        category: l.item.category,
        qty: l.qty,
        contributions: l.contributions.map((c) => ({
          instanceId: c.instanceId,
          showItemId: c.showItemId,
          variantName: c.variantName,
          qty: c.qty,
        })),
      })),
      findings: computed.boq.findings,
    });
  });
}
