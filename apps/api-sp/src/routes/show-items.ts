/**
 * Show-level items — declared quantities that are not canvas placements.
 * Pest control, cleanup, personnel: they belong to the show, not a spot.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../lib/db.js";
import { requireUser, type SessionUser } from "../lib/session.js";

const paramsSchema = z.record(z.string(), z.number().finite());

const createBody = z.object({
  id: z.string().min(1).max(64).optional(),
  itemCode: z.string().min(1),
  qty: z.number().positive().optional(),
  params: paramsSchema.optional(),
});

const patchBody = z
  .object({
    qty: z.number().positive().optional(),
    params: paramsSchema.optional(),
  })
  .strict();

export function showItemDto(row: {
  id: string;
  itemCode: string;
  qty: number;
  params: unknown;
  item?: { name?: string; category?: string; unit?: string } | null;
}) {
  return {
    id: row.id,
    itemCode: row.itemCode,
    name: row.item?.name ?? row.itemCode,
    category: row.item?.category ?? "",
    unit: row.item?.unit ?? "",
    qty: row.qty,
    params: (row.params ?? {}) as Record<string, number>,
  };
}

async function loadLayout(projectId: string, user: SessionUser) {
  return db.layout.findFirst({
    where: { projectId, organisationId: user.organisationId },
    orderBy: { createdAt: "asc" },
  });
}

export async function showItemRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireUser);

  app.post("/:projectId/show-items", async (req, reply) => {
    const user = req.user!;
    const { projectId } = req.params as { projectId: string };
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: "itemCode is required" });
    }

    const layout = await loadLayout(projectId, user);
    if (!layout) {
      return reply.code(404).send({ error: "not_found", message: "Project layout not found" });
    }

    const item = await db.item.findUnique({ where: { code: parsed.data.itemCode } });
    if (!item || item.placement !== "SHOW") {
      return reply.code(400).send({
        error: "not_show_item",
        message: "Only show-level items can be added to this tray",
      });
    }

    const qty = parsed.data.qty ?? 1;
    const existing = await db.showItem.findUnique({
      where: { layoutId_itemCode: { layoutId: layout.id, itemCode: item.code } },
      include: { item: { select: { name: true, category: true, unit: true } } },
    });

    if (existing) {
      const row = await db.showItem.update({
        where: { id: existing.id },
        data: { qty: existing.qty + qty },
        include: { item: { select: { name: true, category: true, unit: true } } },
      });
      return reply.send({ showItem: showItemDto(row) });
    }

    const row = await db.showItem.create({
      data: {
        ...(parsed.data.id ? { id: parsed.data.id } : {}),
        organisationId: user.organisationId,
        layoutId: layout.id,
        itemCode: item.code,
        qty,
        params: parsed.data.params ?? {},
      },
      include: { item: { select: { name: true, category: true, unit: true } } },
    });
    return reply.code(201).send({ showItem: showItemDto(row) });
  });

  app.patch("/:projectId/show-items/:showItemId", async (req, reply) => {
    const user = req.user!;
    const { projectId, showItemId } = req.params as { projectId: string; showItemId: string };
    const parsed = patchBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: "qty must be a positive number" });
    }

    const layout = await loadLayout(projectId, user);
    if (!layout) {
      return reply.code(404).send({ error: "not_found", message: "Project layout not found" });
    }

    const existing = await db.showItem.findFirst({
      where: { id: showItemId, layoutId: layout.id, organisationId: user.organisationId },
    });
    if (!existing) {
      return reply.code(404).send({ error: "not_found", message: "Show item not found" });
    }

    const row = await db.showItem.update({
      where: { id: existing.id },
      data: {
        ...(parsed.data.qty !== undefined ? { qty: parsed.data.qty } : {}),
        ...(parsed.data.params !== undefined ? { params: parsed.data.params } : {}),
      },
      include: { item: { select: { name: true, category: true, unit: true } } },
    });
    return reply.send({ showItem: showItemDto(row) });
  });

  app.delete("/:projectId/show-items/:showItemId", async (req, reply) => {
    const user = req.user!;
    const { projectId, showItemId } = req.params as { projectId: string; showItemId: string };
    const layout = await loadLayout(projectId, user);
    if (!layout) {
      return reply.code(404).send({ error: "not_found", message: "Project layout not found" });
    }
    const existing = await db.showItem.findFirst({
      where: { id: showItemId, layoutId: layout.id, organisationId: user.organisationId },
    });
    if (!existing) {
      return reply.code(404).send({ error: "not_found", message: "Show item not found" });
    }
    await db.showItem.delete({ where: { id: existing.id } });
    return reply.code(204).send();
  });
}
