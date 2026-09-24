/**
 * Informational distance marks. Pixel geometry only — length is derived from
 * the current scale at read time (ADR-005). These never enter buildBoq.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../lib/db.js";
import { requireUser, type SessionUser } from "../lib/session.js";

const point = z.object({ x: z.number().finite(), y: z.number().finite() });

const createBody = z.object({
  id: z.string().min(1).max(64).optional(),
  points: z.array(point).min(2),
});

export function measureMarkDto(row: {
  id: string;
  pointsJson: unknown;
}) {
  const points = Array.isArray(row.pointsJson) ? row.pointsJson : [];
  return {
    id: row.id,
    points: points as { x: number; y: number }[],
  };
}

async function loadLayout(projectId: string, user: SessionUser) {
  const layout = await db.layout.findFirst({
    where: { projectId, organisationId: user.organisationId },
    include: {
      levels: { where: { ordinal: 0 }, take: 1 },
    },
    orderBy: { createdAt: "asc" },
  });
  if (!layout || !layout.levels[0]) return null;
  return { layout, level: layout.levels[0] };
}

export async function measurementRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireUser);

  app.post("/:projectId/measurements", async (req, reply) => {
    const user = req.user!;
    const { projectId } = req.params as { projectId: string };
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: "At least two points required" });
    }

    const loaded = await loadLayout(projectId, user);
    if (!loaded) {
      return reply.code(404).send({ error: "not_found", message: "Project layout not found" });
    }

    const row = await db.measureMark.create({
      data: {
        ...(parsed.data.id ? { id: parsed.data.id } : {}),
        organisationId: user.organisationId,
        levelId: loaded.level.id,
        pointsJson: parsed.data.points,
      },
    });
    return reply.code(201).send({ measurement: measureMarkDto(row) });
  });

  app.delete("/:projectId/measurements/:measurementId", async (req, reply) => {
    const user = req.user!;
    const { projectId, measurementId } = req.params as { projectId: string; measurementId: string };
    const loaded = await loadLayout(projectId, user);
    if (!loaded) {
      return reply.code(404).send({ error: "not_found", message: "Project layout not found" });
    }
    const existing = await db.measureMark.findFirst({
      where: {
        id: measurementId,
        organisationId: user.organisationId,
        levelId: loaded.level.id,
      },
    });
    if (!existing) {
      return reply.code(404).send({ error: "not_found", message: "Measurement not found" });
    }
    await db.measureMark.delete({ where: { id: measurementId } });
    return reply.code(204).send();
  });
}
