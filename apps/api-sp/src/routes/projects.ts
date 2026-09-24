import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../lib/db.js";
import { requireUser, type SessionUser } from "../lib/session.js";

const createBody = z.object({
  name: z.string().trim().min(1).max(200),
});

const patchBody = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    client: z.string().trim().max(200).nullable().optional(),
    venue: z.string().trim().max(200).nullable().optional(),
    city: z.string().trim().max(200).nullable().optional(),
    eventStart: z.string().datetime().nullable().optional(),
    eventEnd: z.string().datetime().nullable().optional(),
    vcDays: z.number().int().min(0).nullable().optional(),
    opsDays: z.number().int().min(0).nullable().optional(),
    defaultRunningHoursPerDay: z.number().min(0).max(24).nullable().optional(),
    /** Archive only — never hard-delete. */
    status: z.enum(["DRAFT", "ARCHIVED"]).optional(),
  })
  .strict();

function projectDto(p: {
  id: string;
  name: string;
  client: string | null;
  venue: string | null;
  city: string | null;
  eventStart: Date | null;
  eventEnd: Date | null;
  vcDays: number | null;
  opsDays: number | null;
  defaultRunningHoursPerDay: number | null;
  status: string;
  ownerId: string;
  organisationId: string;
  createdAt: Date;
  updatedAt: Date;
  owner?: { name: string; email: string };
}) {
  return {
    id: p.id,
    name: p.name,
    client: p.client,
    venue: p.venue,
    city: p.city,
    eventStart: p.eventStart?.toISOString() ?? null,
    eventEnd: p.eventEnd?.toISOString() ?? null,
    vcDays: p.vcDays,
    opsDays: p.opsDays,
    defaultRunningHoursPerDay: p.defaultRunningHoursPerDay,
    status: p.status,
    ownerId: p.ownerId,
    organisationId: p.organisationId,
    ownerName: p.owner?.name ?? null,
    ownerEmail: p.owner?.email ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

async function loadOwned(
  id: string,
  user: SessionUser,
): Promise<ReturnType<typeof projectDto> | null> {
  const row = await db.project.findFirst({
    where: { id, organisationId: user.organisationId },
    include: { owner: { select: { name: true, email: true } } },
  });
  return row ? projectDto(row) : null;
}

/**
 * Skinny projects API: create / list / open / archive.
 * No delete, no search, no duplicate.
 */
export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireUser);

  app.get("/", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user!;
    const q = req.query as { includeArchived?: string };
    const includeArchived = q.includeArchived === "1" || q.includeArchived === "true";

    const rows = await db.project.findMany({
      where: {
        organisationId: user.organisationId,
        ...(includeArchived ? {} : { status: { not: "ARCHIVED" } }),
      },
      include: { owner: { select: { name: true, email: true } } },
      orderBy: { updatedAt: "desc" },
    });
    return reply.send({ projects: rows.map(projectDto) });
  });

  app.post("/", async (req, reply) => {
    const user = req.user!;
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: "name is required" });
    }

    const project = await db.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          name: parsed.data.name,
          organisationId: user.organisationId,
          ownerId: user.id,
          /* Days left null on purpose — settings fill them; pricing must fail closed. */
        },
        include: { owner: { select: { name: true, email: true } } },
      });
      const layout = await tx.layout.create({
        data: {
          organisationId: user.organisationId,
          projectId: created.id,
          name: "Layout 1",
        },
      });
      await tx.level.create({
        data: {
          organisationId: user.organisationId,
          layoutId: layout.id,
          name: "Ground",
          ordinal: 0,
        },
      });
      return created;
    });

    return reply.code(201).send(projectDto(project));
  });

  app.get("/:id", async (req, reply) => {
    const user = req.user!;
    const { id } = req.params as { id: string };
    const row = await loadOwned(id, user);
    if (!row) return reply.code(404).send({ error: "not_found", message: "Project not found" });
    return row;
  });

  app.patch("/:id", async (req, reply) => {
    const user = req.user!;
    const { id } = req.params as { id: string };
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: "Invalid project update" });
    }

    const existing = await db.project.findFirst({
      where: { id, organisationId: user.organisationId },
    });
    if (!existing) {
      return reply.code(404).send({ error: "not_found", message: "Project not found" });
    }

    const data = parsed.data;
    const updated = await db.project.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.client !== undefined ? { client: data.client } : {}),
        ...(data.venue !== undefined ? { venue: data.venue } : {}),
        ...(data.city !== undefined ? { city: data.city } : {}),
        ...(data.eventStart !== undefined
          ? { eventStart: data.eventStart ? new Date(data.eventStart) : null }
          : {}),
        ...(data.eventEnd !== undefined
          ? { eventEnd: data.eventEnd ? new Date(data.eventEnd) : null }
          : {}),
        ...(data.vcDays !== undefined ? { vcDays: data.vcDays } : {}),
        ...(data.opsDays !== undefined ? { opsDays: data.opsDays } : {}),
        ...(data.defaultRunningHoursPerDay !== undefined
          ? { defaultRunningHoursPerDay: data.defaultRunningHoursPerDay }
          : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      },
      include: { owner: { select: { name: true, email: true } } },
    });

    return projectDto(updated);
  });
}
