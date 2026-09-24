/**
 * Place / move / rotate / delete instances.
 *
 * One variant per package per layout on first drop. Size is instance geometry,
 * not variant content, so three stages of different sizes sharing one variant
 * is correct. The variant governs which lines are in the kit. "All my stages
 * carry the same kit" is the common case; an explicit fork (slice 6c) covers
 * "the main stage is different".
 */
import type { FastifyInstance } from "fastify";
import { parseQtyRule, defaultParamValue } from "@overlord/boq";
import { z } from "zod";
import { db } from "../lib/db.js";
import { requireUser, type SessionUser } from "../lib/session.js";

const paramsSchema = z.record(z.string(), z.number().finite());

const placeBody = z.object({
  id: z.string().min(1).max(64).optional(),
  packageId: z.string().min(1),
  xPx: z.number().finite(),
  yPx: z.number().finite(),
  widthPx: z.number().positive().optional(),
  heightPx: z.number().positive().optional(),
  rotationDeg: z.number().finite().optional(),
  params: paramsSchema.optional(),
  runningHoursPerDay: z.number().min(0).max(24).nullable().optional(),
});

const patchBody = z
  .object({
    xPx: z.number().finite().optional(),
    yPx: z.number().finite().optional(),
    widthPx: z.number().positive().nullable().optional(),
    heightPx: z.number().positive().nullable().optional(),
    rotationDeg: z.number().finite().optional(),
    params: paramsSchema.optional(),
    runningHoursPerDay: z.number().min(0).max(24).nullable().optional(),
  })
  .strict();

export function instanceDto(row: {
  id: string;
  variantId: string;
  xPx: number;
  yPx: number;
  widthPx: number | null;
  heightPx: number | null;
  rotationDeg: number;
  params: unknown;
  runningHoursPerDay: number | null;
}) {
  return {
    id: row.id,
    variantId: row.variantId,
    xPx: row.xPx,
    yPx: row.yPx,
    widthPx: row.widthPx,
    heightPx: row.heightPx,
    rotationDeg: row.rotationDeg,
    params: (row.params ?? {}) as Record<string, number>,
    runningHoursPerDay: row.runningHoursPerDay,
  };
}

export function variantDto(
  row: {
    id: string;
    packageId: string;
    name: string;
    templateVersion: number;
    lines: readonly {
      itemCode: string;
      qtyRule: string;
      qtyValue: number;
      flag: string;
      included: boolean;
      item?: { name: string } | null;
    }[];
  },
  instanceCount: number,
) {
  return {
    id: row.id,
    packageId: row.packageId,
    name: row.name,
    templateVersion: row.templateVersion,
    instanceCount,
    lines: row.lines.map((l) => ({
      itemCode: l.itemCode,
      itemName: l.item?.name ?? l.itemCode,
      qtyRule: l.qtyRule,
      qtyValue: l.qtyValue,
      flag: l.flag,
      included: l.included,
    })),
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

function defaultCountParams(lines: readonly { qtyRule: string }[]): Record<string, number> {
  const params: Record<string, number> = {};
  for (const line of lines) {
    const rule = parseQtyRule(line.qtyRule);
    const value = defaultParamValue(rule.kind);
    if (value !== undefined && rule.param) params[rule.param] = value;
  }
  return params;
}

export async function instanceRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireUser);

  app.post("/:projectId/instances", async (req, reply) => {
    const user = req.user!;
    const { projectId } = req.params as { projectId: string };
    const parsed = placeBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: "packageId, xPx, yPx required" });
    }

    const loaded = await loadLayout(projectId, user);
    if (!loaded) {
      return reply.code(404).send({ error: "not_found", message: "Project layout not found" });
    }

    const template = await db.packageTemplate.findUnique({
      where: { packageId: parsed.data.packageId },
      include: { lines: true },
    });
    if (!template) {
      return reply.code(400).send({ error: "unknown_package", message: "Package is not in the catalogue" });
    }

    /* First drop of this package on this layout forks the template. Later drops
       attach to that variant. Slice 6c adds an explicit fork for "this one is
       different". */
    let variant = await db.variant.findFirst({
      where: {
        layoutId: loaded.layout.id,
        packageId: template.packageId,
        organisationId: user.organisationId,
      },
      include: {
        lines: { include: { item: { select: { name: true } } } },
      },
      orderBy: { createdAt: "asc" },
    });

    if (!variant) {
      variant = await db.variant.create({
        data: {
          organisationId: user.organisationId,
          layoutId: loaded.layout.id,
          packageId: template.packageId,
          name: template.name,
          templateVersion: template.version,
          params: {},
          lines: {
            create: template.lines.map((l) => ({
              itemCode: l.itemCode,
              qtyRule: l.qtyRule,
              qtyValue: l.qtyValue,
              flag: l.flag,
              included: l.flag !== "OPTIONAL",
            })),
          },
        },
        include: {
          lines: { include: { item: { select: { name: true } } } },
        },
      });
    }

    const params = {
      ...defaultCountParams(template.lines),
      ...(parsed.data.params ?? {}),
    };

    const instance = await db.instance.create({
      data: {
        ...(parsed.data.id ? { id: parsed.data.id } : {}),
        organisationId: user.organisationId,
        levelId: loaded.level.id,
        variantId: variant.id,
        xPx: parsed.data.xPx,
        yPx: parsed.data.yPx,
        widthPx: parsed.data.widthPx ?? 120,
        heightPx: parsed.data.heightPx ?? 80,
        rotationDeg: parsed.data.rotationDeg ?? 0,
        params,
        runningHoursPerDay: parsed.data.runningHoursPerDay ?? null,
      },
    });

    const count = await db.instance.count({ where: { variantId: variant.id } });
    return reply.code(201).send({
      instance: instanceDto(instance),
      variant: variantDto(variant, count),
    });
  });

  app.patch("/:projectId/instances/:instanceId", async (req, reply) => {
    const user = req.user!;
    const { projectId, instanceId } = req.params as { projectId: string; instanceId: string };
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: "Invalid instance update" });
    }

    const loaded = await loadLayout(projectId, user);
    if (!loaded) {
      return reply.code(404).send({ error: "not_found", message: "Project layout not found" });
    }

    const existing = await db.instance.findFirst({
      where: {
        id: instanceId,
        organisationId: user.organisationId,
        levelId: loaded.level.id,
      },
    });
    if (!existing) {
      return reply.code(404).send({ error: "not_found", message: "Instance not found" });
    }

    const data = parsed.data;
    const updated = await db.instance.update({
      where: { id: instanceId },
      data: {
        ...(data.xPx !== undefined ? { xPx: data.xPx } : {}),
        ...(data.yPx !== undefined ? { yPx: data.yPx } : {}),
        ...(data.widthPx !== undefined ? { widthPx: data.widthPx } : {}),
        ...(data.heightPx !== undefined ? { heightPx: data.heightPx } : {}),
        ...(data.rotationDeg !== undefined ? { rotationDeg: data.rotationDeg } : {}),
        ...(data.params !== undefined ? { params: data.params } : {}),
        ...(data.runningHoursPerDay !== undefined
          ? { runningHoursPerDay: data.runningHoursPerDay }
          : {}),
      },
    });
    return { instance: instanceDto(updated) };
  });

  app.delete("/:projectId/instances/:instanceId", async (req, reply) => {
    const user = req.user!;
    const { projectId, instanceId } = req.params as { projectId: string; instanceId: string };
    const loaded = await loadLayout(projectId, user);
    if (!loaded) {
      return reply.code(404).send({ error: "not_found", message: "Project layout not found" });
    }
    const existing = await db.instance.findFirst({
      where: {
        id: instanceId,
        organisationId: user.organisationId,
        levelId: loaded.level.id,
      },
    });
    if (!existing) {
      return reply.code(404).send({ error: "not_found", message: "Instance not found" });
    }
    await db.instance.delete({ where: { id: instanceId } });
    return reply.code(204).send();
  });
}
