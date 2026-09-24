/**
 * Live BOQ from the current layout. Persists nothing.
 *
 * This is the loading half of the old `computeLiveQuote`: it assembles the
 * catalogue, project, layout, variants, instances and show items, builds the
 * BOQ, and reports geometry-export blockers. No money is computed anywhere in
 * this repo — rates belong to QuoteOS.
 */
import {
  buildBoq,
  deriveScale,
  geometryExportBlockers,
  instanceGeometryFromPx,
  parseQtyRule,
  type Boq,
  type ExportBlocker,
  type ExportLineRef,
  type Scale,
  type PackageItemFlag,
  type Variant,
  type Instance,
  type ShowItem,
  type LengthUnit,
} from "@overlord/boq";
import { db } from "./db.js";
import { loadCatalogueFromDb } from "./catalogue-from-db.js";
import type { SessionUser } from "./session.js";

const LENGTH_UNITS = new Set(["mm", "cm", "m", "ft", "in"]);

export type ComputeOk = {
  ok: true;
  boq: Boq;
  scale: Scale | null;
  blockers: ExportBlocker[];
  project: {
    id: string;
    organisationId: string;
    city: string | null;
    vcDays: number | null;
    opsDays: number | null;
    defaultRunningHoursPerDay: number | null;
  };
  layoutId: string;
  catalogueVersionId: string;
  catalogueVersionLabel: string;
};

export type ComputeErr = {
  ok: false;
  status: number;
  error: string;
  message: string;
  reason?: string;
  blockers?: ExportBlocker[];
};

function scaleFromBaseMap(row: {
  calAx: number | null;
  calAy: number | null;
  calBx: number | null;
  calBy: number | null;
  calKnownValue: number | null;
  calKnownUnit: string | null;
  calibratedAt: Date | null;
  calibratedById: string | null;
} | null): Scale | null {
  if (
    !row ||
    row.calAx == null ||
    row.calAy == null ||
    row.calBx == null ||
    row.calBy == null ||
    row.calKnownValue == null ||
    row.calKnownUnit == null ||
    !LENGTH_UNITS.has(row.calKnownUnit)
  ) {
    return null;
  }
  try {
    return deriveScale({
      pointA: { x: row.calAx, y: row.calAy },
      pointB: { x: row.calBx, y: row.calBy },
      knownDistance: row.calKnownValue,
      knownUnit: row.calKnownUnit as LengthUnit,
      calibratedAt: row.calibratedAt?.toISOString() ?? new Date(0).toISOString(),
      calibratedByUserId: row.calibratedById ?? "",
    });
  } catch {
    return null;
  }
}

export async function computeLiveBoq(
  projectId: string,
  user: SessionUser,
): Promise<ComputeOk | ComputeErr> {
  const loaded = await loadCatalogueFromDb();
  if (!loaded) {
    return {
      ok: false,
      status: 503,
      error: "catalogue_missing",
      message: "Import the catalogue before building a BOQ.",
    };
  }

  const project = await db.project.findFirst({
    where: { id: projectId, organisationId: user.organisationId },
  });
  if (!project) {
    return { ok: false, status: 404, error: "not_found", message: "Project not found" };
  }

  const layout = await db.layout.findFirst({
    where: { projectId, organisationId: user.organisationId },
    include: {
      levels: { where: { ordinal: 0 }, take: 1, include: { baseMap: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const level = layout?.levels[0];
  if (!layout || !level) {
    return { ok: false, status: 404, error: "not_found", message: "Project layout not found" };
  }

  const scale = scaleFromBaseMap(level.baseMap);

  const [variantRows, instanceRows, showItemRows] = await Promise.all([
    db.variant.findMany({
      where: { layoutId: layout.id, organisationId: user.organisationId },
      include: { lines: true },
    }),
    db.instance.findMany({
      where: { levelId: level.id, organisationId: user.organisationId },
    }),
    db.showItem.findMany({
      where: { layoutId: layout.id, organisationId: user.organisationId },
    }),
  ]);

  const variants: Variant[] = variantRows.map((v) => ({
    variantId: v.id,
    packageId: v.packageId,
    name: v.name,
    templateVersion: String(v.templateVersion),
    lines: v.lines.map((l) => ({
      itemCode: l.itemCode,
      rule: parseQtyRule(l.qtyRule),
      qtyValue: l.qtyValue,
      flag: l.flag as PackageItemFlag,
      included: l.included,
      overrideDays: l.overrideDays,
    })),
  }));

  const instances: Instance[] = instanceRows.map((i) => ({
    instanceId: i.id,
    variantId: i.variantId,
    geometry: instanceGeometryFromPx(i.widthPx, i.heightPx, scale),
    params: (i.params ?? {}) as Record<string, number>,
    runningHoursPerDay: i.runningHoursPerDay,
  }));

  const showItems: ShowItem[] = showItemRows.map((s) => ({
    showItemId: s.id,
    itemCode: s.itemCode,
    qty: s.qty,
    params: (s.params ?? {}) as Record<string, number>,
  }));

  const boq = buildBoq(loaded.catalogue, variants, instances, showItems);

  const exportLines: ExportLineRef[] = [];
  for (const v of variants) {
    for (const l of v.lines) {
      if (!l.included) continue;
      exportLines.push({ itemCode: l.itemCode, rule: l.rule, label: v.name });
    }
  }
  for (const s of showItems) {
    exportLines.push({
      itemCode: s.itemCode,
      rule: { kind: "FIXED", param: null },
      label: "Show",
    });
  }
  const blockers = geometryExportBlockers({ scale, lines: exportLines });

  return {
    ok: true,
    boq,
    scale,
    blockers,
    project: {
      id: project.id,
      organisationId: project.organisationId,
      city: project.city,
      vcDays: project.vcDays,
      opsDays: project.opsDays,
      defaultRunningHoursPerDay: project.defaultRunningHoursPerDay,
    },
    layoutId: layout.id,
    catalogueVersionId: loaded.versionId,
    catalogueVersionLabel: loaded.versionLabel,
  };
}
