/**
 * Base map upload (presign → client PUT → confirm) and scale calibration.
 * Layout/level are created with the project; this owns the map on Ground.
 */
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  CalibrationError,
  calibrationLooksImplausible,
  deriveScale,
  distance,
  formatImplausibleCalibrationMessage,
  type LengthUnit,
} from "@overlord/boq";
import { z } from "zod";
import { db } from "../lib/db.js";
import { requireUser, type SessionUser } from "../lib/session.js";
import { R2NotConfiguredError, presignGet, presignPut } from "../lib/r2.js";
import { instanceDto, variantDto } from "./instances.js";
import { showItemDto } from "./show-items.js";
import { measureMarkDto } from "./measurements.js";

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_UPLOAD = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
/** After client-side PDF rasterisation we store a PNG. */
const ALLOWED_STORED = new Set(["image/jpeg", "image/png", "image/webp"]);

const LENGTH_UNITS = ["mm", "cm", "m", "ft", "in"] as const;

const presignBody = z.object({
  mimeType: z.string().min(1),
  byteSize: z.number().int().positive(),
  fileName: z.string().min(1).max(255).optional(),
});

const confirmBody = z.object({
  objectKey: z.string().min(1),
  mimeType: z.string().min(1),
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
  pageCount: z.number().int().positive().nullable().optional(),
  sourcePage: z.number().int().positive().default(1),
});

const calibrateBody = z.object({
  pointA: z.object({ x: z.number().finite(), y: z.number().finite() }),
  pointB: z.object({ x: z.number().finite(), y: z.number().finite() }),
  knownDistance: z.number().positive(),
  knownUnit: z.enum(LENGTH_UNITS),
  /** Soft-warn override after implied-width check. */
  acceptImplausible: z.boolean().optional(),
});

function r2Error(reply: FastifyReply, err: unknown) {
  if (err instanceof R2NotConfiguredError) {
    return reply.code(503).send({
      error: err.code,
      message: err.message,
      missing: err.missing,
    });
  }
  throw err;
}

async function loadGroundLevel(projectId: string, user: SessionUser) {
  const layout = await db.layout.findFirst({
    where: { projectId, organisationId: user.organisationId },
    include: {
      levels: {
        where: { ordinal: 0 },
        take: 1,
        include: { baseMap: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  if (!layout) return null;
  let level = layout.levels[0];
  if (!level) {
    level = await db.level.create({
      data: {
        organisationId: user.organisationId,
        layoutId: layout.id,
        name: "Ground",
        ordinal: 0,
      },
      include: { baseMap: true },
    });
  }
  return { layout, level };
}

function clearCalibrationFields() {
  return {
    calAx: null,
    calAy: null,
    calBx: null,
    calBy: null,
    calKnownValue: null,
    calKnownUnit: null,
    calibratedAt: null,
    calibratedById: null,
  };
}

function baseMapDto(
  row: NonNullable<Awaited<ReturnType<typeof loadGroundLevel>>>["level"]["baseMap"],
  viewUrl: string | null,
) {
  if (!row) return null;
  const hasCal =
    row.calAx != null &&
    row.calAy != null &&
    row.calBx != null &&
    row.calBy != null &&
    row.calKnownValue != null &&
    row.calKnownUnit != null;

  let scale: { mmPerPixel: number } | null = null;
  let impliedWidthM: number | null = null;
  let calibration = null;

  if (hasCal) {
    try {
      scale = deriveScale({
        pointA: { x: row.calAx!, y: row.calAy! },
        pointB: { x: row.calBx!, y: row.calBy! },
        knownDistance: row.calKnownValue!,
        knownUnit: row.calKnownUnit as LengthUnit,
        calibratedAt: row.calibratedAt?.toISOString() ?? new Date(0).toISOString(),
        calibratedByUserId: row.calibratedById ?? "",
      });
      impliedWidthM = calibrationLooksImplausible(
        scale,
        row.widthPx,
        distance(
          { x: row.calAx!, y: row.calAy! },
          { x: row.calBx!, y: row.calBy! },
        ),
      ).impliedWidthM;
      calibration = {
        pointA: { x: row.calAx!, y: row.calAy! },
        pointB: { x: row.calBx!, y: row.calBy! },
        knownDistance: row.calKnownValue!,
        knownUnit: row.calKnownUnit!,
        calibratedAt: row.calibratedAt?.toISOString() ?? null,
        calibratedById: row.calibratedById,
      };
    } catch {
      scale = null;
      calibration = null;
    }
  }

  return {
    id: row.id,
    mimeType: row.mimeType,
    widthPx: row.widthPx,
    heightPx: row.heightPx,
    pageCount: row.pageCount,
    sourcePage: row.sourcePage,
    uploadedAt: row.uploadedAt.toISOString(),
    viewUrl,
    calibration,
    scale,
    impliedWidthM,
  };
}

export async function basemapRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireUser);

  app.get("/:projectId/layout", async (req, reply) => {
    const user = req.user!;
    const { projectId } = req.params as { projectId: string };
    const loaded = await loadGroundLevel(projectId, user);
    if (!loaded) {
      return reply.code(404).send({ error: "not_found", message: "Project layout not found" });
    }

    let viewUrl: string | null = null;
    if (loaded.level.baseMap) {
      try {
        viewUrl = await presignGet(loaded.level.baseMap.objectKey);
      } catch (err) {
        return r2Error(reply, err);
      }
    }

    const variants = await db.variant.findMany({
      where: { layoutId: loaded.layout.id, organisationId: user.organisationId },
      include: {
        lines: { include: { item: { select: { name: true } } } },
        _count: { select: { instances: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    const instances = await db.instance.findMany({
      where: { levelId: loaded.level.id, organisationId: user.organisationId },
      orderBy: { createdAt: "asc" },
    });
    const measurements = await db.measureMark.findMany({
      where: { levelId: loaded.level.id, organisationId: user.organisationId },
      orderBy: { createdAt: "asc" },
    });
    const showItems = await db.showItem.findMany({
      where: { layoutId: loaded.layout.id, organisationId: user.organisationId },
      include: { item: { select: { name: true, category: true, unit: true } } },
      orderBy: { createdAt: "asc" },
    });

    return {
      layout: {
        id: loaded.layout.id,
        name: loaded.layout.name,
        projectId: loaded.layout.projectId,
      },
      level: {
        id: loaded.level.id,
        name: loaded.level.name,
        ordinal: loaded.level.ordinal,
      },
      baseMap: baseMapDto(loaded.level.baseMap, viewUrl),
      mapState: loaded.level.baseMap
        ? loaded.level.baseMap.calAx != null
          ? "calibrated"
          : "map_uncalibrated"
        : "no_map",
      variants: variants.map((v) => variantDto(v, v._count.instances)),
      instances: instances.map(instanceDto),
      measurements: measurements.map(measureMarkDto),
      showItems: showItems.map(showItemDto),
    };
  });

  app.post("/:projectId/basemap/presign", async (req, reply) => {
    const user = req.user!;
    const { projectId } = req.params as { projectId: string };
    const parsed = presignBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: "mimeType and byteSize required" });
    }

    const { mimeType, byteSize } = parsed.data;
    if (!ALLOWED_UPLOAD.has(mimeType) && !ALLOWED_STORED.has(mimeType)) {
      return reply.code(400).send({
        error: "wrong_type",
        message: "Upload JPG, PNG, WebP, or PDF only",
      });
    }
    if (byteSize > MAX_BYTES) {
      return reply.code(400).send({
        error: "too_large",
        message: "File must be 25 MB or smaller",
      });
    }

    const loaded = await loadGroundLevel(projectId, user);
    if (!loaded) {
      return reply.code(404).send({ error: "not_found", message: "Project layout not found" });
    }

    const objectKey =
      `orgs/${user.organisationId}/projects/${projectId}/basemaps/${randomUUID()}`;

    try {
      const signed = await presignPut({
        objectKey,
        contentType: mimeType,
        contentLength: byteSize,
      });
      return {
        objectKey,
        uploadUrl: signed.url,
        headers: signed.headers,
        maxBytes: MAX_BYTES,
      };
    } catch (err) {
      return r2Error(reply, err);
    }
  });

  app.post("/:projectId/basemap/confirm", async (req, reply) => {
    const user = req.user!;
    const { projectId } = req.params as { projectId: string };
    const parsed = confirmBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: "Invalid basemap confirm" });
    }

    const data = parsed.data;
    if (!ALLOWED_STORED.has(data.mimeType)) {
      return reply.code(400).send({
        error: "wrong_type",
        message: "Stored base map must be JPG, PNG, or WebP (rasterise PDFs client-side)",
      });
    }

    const prefix = `orgs/${user.organisationId}/projects/${projectId}/basemaps/`;
    if (!data.objectKey.startsWith(prefix)) {
      return reply.code(400).send({ error: "invalid_key", message: "objectKey does not belong to this project" });
    }

    const loaded = await loadGroundLevel(projectId, user);
    if (!loaded) {
      return reply.code(404).send({ error: "not_found", message: "Project layout not found" });
    }

    const fields = {
      organisationId: user.organisationId,
      objectKey: data.objectKey,
      mimeType: data.mimeType,
      widthPx: data.widthPx,
      heightPx: data.heightPx,
      pageCount: data.pageCount ?? null,
      sourcePage: data.sourcePage,
      uploadedAt: new Date(),
      ...clearCalibrationFields(),
    };

    const row = loaded.level.baseMap
      ? await db.baseMap.update({
          where: { id: loaded.level.baseMap.id },
          data: fields,
        })
      : await db.baseMap.create({
          data: { ...fields, levelId: loaded.level.id },
        });

    let viewUrl: string | null = null;
    try {
      viewUrl = await presignGet(row.objectKey);
    } catch (err) {
      return r2Error(reply, err);
    }

    return reply.code(201).send({
      baseMap: baseMapDto(row, viewUrl),
      mapState: "map_uncalibrated",
      calibrationCleared: true,
    });
  });

  app.put("/:projectId/basemap/calibration", async (req, reply) => {
    const user = req.user!;
    const { projectId } = req.params as { projectId: string };
    const parsed = calibrateBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: "Invalid calibration" });
    }

    const loaded = await loadGroundLevel(projectId, user);
    if (!loaded?.level.baseMap) {
      return reply.code(400).send({
        error: "no_map",
        message: "Upload a venue plan before calibrating",
      });
    }

    const body = parsed.data;
    let scale;
    try {
      scale = deriveScale({
        pointA: body.pointA,
        pointB: body.pointB,
        knownDistance: body.knownDistance,
        knownUnit: body.knownUnit,
        calibratedAt: new Date().toISOString(),
        calibratedByUserId: user.id,
      });
    } catch (err) {
      if (err instanceof CalibrationError) {
        return reply.code(400).send({ error: "invalid_calibration", message: err.message });
      }
      throw err;
    }

    const segmentPx = distance(body.pointA, body.pointB);
    const check = calibrationLooksImplausible(
      scale,
      loaded.level.baseMap.widthPx,
      segmentPx,
    );
    if (check.implausible && !body.acceptImplausible) {
      return reply.code(409).send({
        error: "implausible_scale",
        message: formatImplausibleCalibrationMessage(check),
        impliedWidthM: check.impliedWidthM,
        reasons: check.reasons,
      });
    }

    const row = await db.baseMap.update({
      where: { id: loaded.level.baseMap.id },
      data: {
        calAx: body.pointA.x,
        calAy: body.pointA.y,
        calBx: body.pointB.x,
        calBy: body.pointB.y,
        calKnownValue: body.knownDistance,
        calKnownUnit: body.knownUnit,
        calibratedAt: new Date(),
        calibratedById: user.id,
      },
    });

    let viewUrl: string | null = null;
    try {
      viewUrl = await presignGet(row.objectKey);
    } catch (err) {
      return r2Error(reply, err);
    }

    return {
      baseMap: baseMapDto(row, viewUrl),
      mapState: "calibrated",
      impliedWidthM: check.impliedWidthM,
      implausible: check.implausible,
    };
  });
}
