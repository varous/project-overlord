/**
 * Write a loaded catalogue into Postgres. Idempotent by code — upsert items /
 * curves / packages.
 *
 * `items.code` is a foreign key across the whole system. An item that vanishes
 * from the sheet is reported, not removed.
 *
 * No rate data is written: rates live in QuoteOS. Fuel consumption is a physical
 * property carried on the item row.
 */
import type { PrismaClient } from "@prisma/client";
import type { Catalogue, Finding } from "@overlord/boq";

export type ImportLog = Pick<Console, "log" | "warn">;

export async function writeCatalogue(
  db: PrismaClient,
  catalogue: Catalogue,
  findings: readonly Finding[],
  label: string,
  log: ImportLog = console,
  opts: { pruneStaleAutos?: boolean } = {},
): Promise<{ items: number; curves: number; packages: number; version: string }> {
  for (const curve of catalogue.curves.values()) {
    await db.dayCurve.upsert({
      where: { id: curve.id },
      create: { id: curve.id, table: curve.table },
      update: { table: curve.table },
    });
  }

  const existing = new Set((await db.item.findMany({ select: { code: true } })).map((i) => i.code));
  for (const item of catalogue.items.values()) {
    const data = {
      name: item.name,
      category: item.category,
      section: item.section,
      unit: item.unit,
      qtyBasis: item.qtyBasis,
      dayCurveId: item.dayCurve,
      tags: [...item.tags],
      linkedRateItem: item.linkedRateItem,
      consumptionLitresPerHour: item.consumptionLitresPerHour,
      powerSupplyKva: item.powerSupplyKva,
      notes: item.notes,
      sortOrder: item.sortOrder,
      placement: item.placement,
    };
    await db.item.upsert({ where: { code: item.code }, create: { code: item.code, ...data }, update: data });
  }
  const vanished = [...existing].filter((code) => !catalogue.items.has(code));
  if (vanished.length > 0) {
    log.warn(
      `[import] ${vanished.length} item(s) are in the database but not in this bundle. ` +
        `NOT deleted — codes are foreign keys: ${vanished.join(", ")}`,
    );
  }

  for (const pkg of catalogue.packages.values()) {
    const prior = await db.packageTemplate.findUnique({
      where: { packageId: pkg.packageId },
      include: { lines: true },
    });
    const nextLines = pkg.lines
      .map((l) => `${l.itemCode}|${l.rule.kind}${l.rule.param ? ":" + l.rule.param : ""}|${l.qtyValue}|${l.flag}`)
      .sort()
      .join(";");
    const priorLines = (prior?.lines ?? [])
      .map((l) => `${l.itemCode}|${l.qtyRule}|${l.qtyValue}|${l.flag}`)
      .sort()
      .join(";");
    const changed = prior !== null && priorLines !== nextLines;

    await db.packageTemplate.upsert({
      where: { packageId: pkg.packageId },
      create: {
        packageId: pkg.packageId,
        name: pkg.name,
        description: pkg.description,
        params: [...pkg.params],
        version: 1,
        auto: pkg.auto,
      },
      update: {
        name: pkg.name,
        description: pkg.description,
        params: [...pkg.params],
        auto: pkg.auto,
        ...(changed ? { version: { increment: 1 } } : {}),
      },
    });
    await db.packageItem.deleteMany({ where: { packageId: pkg.packageId } });
    await db.packageItem.createMany({
      data: pkg.lines.map((l) => ({
        packageId: l.packageId,
        itemCode: l.itemCode,
        qtyRule: l.rule.param ? `${l.rule.kind}:${l.rule.param}` : l.rule.kind,
        qtyValue: l.qtyValue,
        flag: l.flag,
      })),
    });
    if (changed) log.log(`[import] ${pkg.packageId} lines changed — template version bumped`);
  }

  if (opts.pruneStaleAutos !== false) {
    const autoIds = [...catalogue.packages.values()].filter((p) => p.auto).map((p) => p.packageId);
    const staleAuto = await db.packageTemplate.findMany({
      where: { auto: true, packageId: { notIn: autoIds } },
      select: { packageId: true, _count: { select: { variants: true } } },
    });
    for (const row of staleAuto) {
      if (row._count.variants > 0) {
        log.warn(
          `[import] ${row.packageId} is no longer auto-generated but ${row._count.variants} variant(s) still point at it — not deleted.`,
        );
        continue;
      }
      await db.packageTemplate.delete({ where: { packageId: row.packageId } });
    }
  }

  await db.catalogueVersion.upsert({
    where: { label },
    create: {
      label,
      itemCount: catalogue.items.size,
      findings: findings as unknown as object,
    },
    update: {
      itemCount: catalogue.items.size,
      findings: findings as unknown as object,
    },
  });

  return {
    items: catalogue.items.size,
    curves: catalogue.curves.size,
    packages: catalogue.packages.size,
    version: label,
  };
}
