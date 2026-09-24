/**
 * Template → Variant → Instance, and the quantity resolution across it.
 *
 *   Template  admin data, versioned. Editing one never mutates a project.
 *   Variant   a project-local, named copy the user customised within the flags.
 *   Instance  one canvas placement pointing at a variant.
 *
 * Duplicating a placement creates another instance of the same variant, so
 * editing the variant (slice 6c) updates every copy. That is the behaviour
 * that makes a 40-gate layout maintainable — and why the blast-radius readout
 * ships in slice 4.
 *
 * Size is INSTANCE geometry, not variant content: three stages of different
 * sizes sharing one variant is correct. The variant governs which lines are
 * in the kit. Params such as `counters` or `lanes` describe THIS placement
 * and live on the instance, so editing them has no blast radius.
 */

import type { Catalogue, PackageItemFlag, PackageTemplate, QtyRule } from "./catalog.js";
import type { Finding } from "./findings.js";
import type { Scale } from "./scale.js";
import { pixelsToMm, sqPixelsToSqMm } from "./scale.js";
import { fromMm, sqMmTo, toMm, toSqMm } from "./units.js";

/** A line inside a project's variant. Mirrors a template line, plus user intent. */
export interface VariantLine {
  readonly itemCode: string;
  readonly rule: QtyRule;
  readonly qtyValue: number;
  readonly flag: PackageItemFlag;
  /** MANDATORY lines cannot be false. Enforced by `applyCustomisation`. */
  readonly included: boolean;
  /** Vendor-negotiated one-off; beats the day curve for this line. */
  readonly overrideDays: number | null;
}

export interface Variant {
  readonly variantId: string;
  readonly packageId: string;
  readonly name: string;
  /** Snapshot of the template version this variant was forked from. */
  readonly templateVersion: string;
  readonly lines: readonly VariantLine[];
}

/** Geometry of one placement, in the units the qty rules expect. */
export interface InstanceGeometry {
  /** Footprint in square feet — PER_AREA, and PER_VOLUME (converted to cbm). Null when uncalibrated. */
  readonly areaSqft: number | null;
  /** Frontage or perimeter in running feet — PER_LENGTH and PER_FRONT_FACE. Null when uncalibrated. */
  readonly lengthRft: number | null;
}

export interface Instance {
  readonly instanceId: string;
  readonly variantId: string;
  readonly geometry: InstanceGeometry;
  /**
   * Placement params (`counters`, `lanes`, …). Not kit content.
   * Omit or `{}` when the package has no PER_COUNT_PARAM / PER_FRONT_FACE / PER_VOLUME lines.
   */
  readonly params?: Readonly<Record<string, number>>;
  /**
   * Running hours per day, asked ONLY for a placement that carries a generator.
   *
   * Your rule: the layout places generators; fuel is not part of laying out an
   * event. If someone does want fuel in the quotation, the app asks for this
   * placement's running hours and derives it. Left null, every fuel line on this
   * placement is omitted from the BOQ entirely — not zeroed, omitted.
   *
   * Per-instance rather than per-project because two gensets on one site
   * genuinely run different hours: the stage genset runs the show, the backstage
   * genset runs all day.
   */
  readonly runningHoursPerDay?: number | null;
}

/** Build a fresh variant from a template: MANDATORY + DEFAULT_ON on, OPTIONAL off. */
export function variantFromTemplate(
  catalogue: Catalogue,
  packageId: string,
  variantId: string,
  name: string,
): { variant: Variant | null; findings: Finding[] } {
  const template = catalogue.packages.get(packageId);
  if (!template) {
    return {
      variant: null,
      findings: [{
        severity: "error", code: "ITEM_UNKNOWN", packageId,
        message: `Package template "${packageId}" is not in the catalogue.`,
      }],
    };
  }
  return {
    variant: {
      variantId,
      packageId,
      name,
      templateVersion: catalogue.version,
      lines: template.lines.map((l) => ({
        itemCode: l.itemCode,
        rule: l.rule,
        qtyValue: l.qtyValue,
        flag: l.flag,
        included: l.flag !== "OPTIONAL",
        overrideDays: null,
      })),
    },
    findings: [],
  };
}

/**
 * Apply a user's edit to a variant. The flag rules are the contract:
 * MANDATORY cannot be removed, and only the template's OPTIONAL set may be added.
 */
export function setLineIncluded(
  variant: Variant,
  itemCode: string,
  included: boolean,
): { variant: Variant; findings: Finding[] } {
  const findings: Finding[] = [];
  const lines = variant.lines.map((l) => {
    if (l.itemCode !== itemCode) return l;
    if (l.flag === "MANDATORY" && !included) {
      findings.push({
        severity: "error", code: "RULE_BASIS_MISMATCH", itemCode,
        message: `${itemCode} is MANDATORY in this package and cannot be removed.`,
      });
      return l;
    }
    return { ...l, included };
  });
  return { variant: { ...variant, lines }, findings };
}

/**
 * Params that actually drive quantity — names used by PER_COUNT_PARAM lines.
 * Template.params may also list width_ft/depth_ft; those are instance geometry,
 * not params, and must not be copied here. PER_FRONT_FACE / PER_VOLUME height
 * is a separate default (see `defaultInstanceParams`).
 */
export function countParamNames(template: PackageTemplate): readonly string[] {
  const names: string[] = [];
  for (const line of template.lines) {
    if (line.rule.kind !== "PER_COUNT_PARAM" || !line.rule.param) continue;
    if (!names.includes(line.rule.param)) names.push(line.rule.param);
  }
  return names;
}

/** Default value for a qty-rule parameter so a drop is immediately countable. */
export function defaultParamValue(kind: QtyRule["kind"]): number | undefined {
  if (kind === "PER_COUNT_PARAM") return 1;
  if (kind === "PER_FRONT_FACE" || kind === "PER_VOLUME") return 8;
  return undefined;
}

/** Default every count param to 1 and every face/volume height to 8. */
export function defaultInstanceParams(template: PackageTemplate): Record<string, number> {
  const params: Record<string, number> = {};
  for (const line of template.lines) {
    const value = defaultParamValue(line.rule.kind);
    if (value === undefined || !line.rule.param) continue;
    if (params[line.rule.param] === undefined) params[line.rule.param] = value;
  }
  return params;
}

/**
 * Pixel footprint → qty geometry. Uncalibrated returns nulls, never an estimate.
 * Frontage (PER_LENGTH / PER_FRONT_FACE) is the placed width.
 */
export function instanceGeometryFromPx(
  widthPx: number | null | undefined,
  heightPx: number | null | undefined,
  scale: Scale | null,
): InstanceGeometry {
  if (scale === null || widthPx == null || heightPx == null) {
    return { areaSqft: null, lengthRft: null };
  }
  const areaSqMm = sqPixelsToSqMm(widthPx * heightPx, scale);
  const widthMm = pixelsToMm(widthPx, scale);
  return {
    areaSqft: areaSqMm == null ? null : sqMmTo(areaSqMm, "sqft"),
    lengthRft: widthMm == null ? null : fromMm(widthMm, "ft"),
  };
}

/** Sketch size when there is no scale; 10×8 ft once calibrated. */
export function defaultFootprintPx(scale: Scale | null): { widthPx: number; heightPx: number } {
  if (scale === null) return { widthPx: 120, heightPx: 80 };
  const ft = 304.8;
  return {
    widthPx: (10 * ft) / scale.mmPerPixel,
    heightPx: (8 * ft) / scale.mmPerPixel,
  };
}

/** Resolve one variant line's quantity against one instance. Null = un-quantifiable. */
export function resolveQty(
  line: VariantLine,
  variant: Variant,
  instance: Instance,
): { qty: number | null; findings: Finding[] } {
  const findings: Finding[] = [];
  const params = instance.params ?? {};

  switch (line.rule.kind) {
    case "FIXED":
      return { qty: line.qtyValue, findings };

    case "PER_AREA": {
      const area = instance.geometry.areaSqft;
      if (area === null) {
        findings.push({
          severity: "error", code: "GEOMETRY_MISSING",
          itemCode: line.itemCode, instanceId: instance.instanceId,
          message: `${line.itemCode} is priced per sqft but this placement has no footprint area.`,
        });
        return { qty: null, findings };
      }
      return { qty: line.qtyValue * area, findings };
    }

    case "PER_LENGTH": {
      const length = instance.geometry.lengthRft;
      if (length === null) {
        findings.push({
          severity: "error", code: "GEOMETRY_MISSING",
          itemCode: line.itemCode, instanceId: instance.instanceId,
          message: `${line.itemCode} is priced per running ft but this placement has no length.`,
        });
        return { qty: null, findings };
      }
      return { qty: line.qtyValue * length, findings };
    }

    case "PER_COUNT_PARAM": {
      const param = line.rule.param!;
      const value = params[param];
      if (value === undefined) {
        findings.push({
          severity: "error", code: "PARAM_MISSING",
          itemCode: line.itemCode, packageId: variant.packageId,
          message: `${line.itemCode} needs placement parameter "${param}", which is not set on this instance.`,
        });
        return { qty: null, findings };
      }
      return { qty: line.qtyValue * value, findings };
    }

    case "PER_FRONT_FACE": {
      const length = instance.geometry.lengthRft;
      if (length === null) {
        findings.push({
          severity: "error", code: "GEOMETRY_MISSING",
          itemCode: line.itemCode, instanceId: instance.instanceId,
          message: `${line.itemCode} is priced per front-face sqft but this placement has no frontage.`,
        });
        return { qty: null, findings };
      }
      const param = line.rule.param!;
      const value = params[param];
      if (value === undefined) {
        findings.push({
          severity: "error", code: "PARAM_MISSING",
          itemCode: line.itemCode, packageId: variant.packageId,
          message: `${line.itemCode} needs placement parameter "${param}", which is not set on this instance.`,
        });
        return { qty: null, findings };
      }
      return { qty: line.qtyValue * length * value, findings };
    }

    case "PER_VOLUME": {
      const area = instance.geometry.areaSqft;
      if (area === null) {
        findings.push({
          severity: "error", code: "GEOMETRY_MISSING",
          itemCode: line.itemCode, instanceId: instance.instanceId,
          message: `${line.itemCode} is priced per cbm but this placement has no footprint area.`,
        });
        return { qty: null, findings };
      }
      const param = line.rule.param!;
      const value = params[param];
      if (value === undefined) {
        findings.push({
          severity: "error", code: "PARAM_MISSING",
          itemCode: line.itemCode, packageId: variant.packageId,
          message: `${line.itemCode} needs placement parameter "${param}", which is not set on this instance.`,
        });
        return { qty: null, findings };
      }
      /* Sold unit is cbm. Footprint is stored as sqft (PER_AREA's unit);
         convert via canonical mm rather than treating cu ft as cubic metres. */
      const qtyCbm = line.qtyValue * (toSqMm(area, "sqft") * toMm(value, "ft")) / 1_000_000_000;
      return { qty: qtyCbm, findings };
    }
  }
}
