/**
 * Catalogue DTOs for the editor palette.
 *
 * Money never appears here — rates belong to QuoteOS. This module copies named
 * fields only, so nothing rate-shaped can serialise even by accident.
 */

export type PackageLineDto = {
  itemCode: string;
  itemName: string;
  qtyRule: string;
  qtyValue: number;
  flag: string;
};

export type PackageDto = {
  packageId: string;
  name: string;
  description: string | null;
  params: string[];
  version: number;
  auto: boolean;
  category: string | null;
  lines: PackageLineDto[];
};

export type ShowCatalogItemDto = {
  code: string;
  name: string;
  category: string;
  unit: string;
};

type LineRow = {
  itemCode: string;
  qtyRule: string;
  qtyValue: number;
  flag: string;
  item?: { name?: string; category?: string } | null;
};

type PackageRow = {
  packageId: string;
  name: string;
  description: string | null;
  params: string[];
  version: number;
  auto?: boolean;
  lines: LineRow[];
};

export function toPackageDto(row: PackageRow): PackageDto {
  const category = row.lines[0]?.item?.category ?? null;
  return {
    packageId: row.packageId,
    name: row.name,
    description: row.description,
    params: [...row.params],
    version: row.version,
    auto: row.auto === true,
    category,
    lines: row.lines.map((l) => ({
      itemCode: l.itemCode,
      itemName: l.item?.name ?? l.itemCode,
      qtyRule: l.qtyRule,
      qtyValue: l.qtyValue,
      flag: l.flag,
    })),
  };
}
