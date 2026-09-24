/**
 * The V2 shell — built faithfully, then stripped by capability flag.
 *
 * Layout is EXACTLY handoff-digest.md §3.4 / §7 in both builds:
 *   menubar 40 · viewbar 44 · modebar 36 · workspace · statusbar 32
 *   left panel 296 (tool rail 48 + sections 248) · right panel 300 · canvas flex
 *
 * Slice 3: base-map upload + scale calibration inside this shell.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Avatar, Badge, Button, DataField, DividerV, Field, FloatingToolbar,
  IconButton, LayerRow, Modal, Search, Section, SectionHeader, Segmented, Select, Tab,
  Tabs, ToolChip, ScrollArea, type Segment,
} from "./primitives.js";
import { Icon } from "./Icon.js";
import type { IconName } from "./icon-registry.js";
import { MVP, NOT_YET, SNAP_NOT_YET, SCALE_FIRST, AREA_LATER, AIDS_NOT_YET, ZONES_NOT_YET, type Capabilities } from "../lib/capabilities.js";
import { applyTheme, getTheme, type Theme } from "../lib/theme.js";
import { AppMenubar } from "./AppMenubar.js";
import { DropdownSelect } from "./DropdownSelect.js";
import { CanvasStage } from "./CanvasStage.js";
import {
  api,
  ApiError,
  putToPresignedUrl,
  type BaseMapDto,
  type CataloguePackage,
  type CatalogueShowItem,
  type LayoutInstance,
  type LayoutMeasurement,
  type LayoutShowItem,
  type LayoutVariant,
  type MapState,
} from "../lib/api.js";
import { snapshotFile } from "../lib/snapshot-file.js";
import { isPositiveDistance, modeBarHint } from "../lib/mode-bar-hint.js";
import {
  SELECT_TOOL,
  dataToolOf,
  railToolOf,
  type CalPoint,
  type CanvasMode,
} from "../lib/canvas-mode.js";
import { History } from "../lib/history.js";
import { putDraft } from "../lib/drafts.js";
import { inspectorMeasureLabel } from "../lib/measure-label.js";
import type { LengthUnit } from "@overlord/boq";
import { AssetsPalette, ShowItemTray } from "./CataloguePalette.js";
import {
  calibrationLooksImplausible,
  defaultFootprintPx,
  deriveScale,
  distance,
  formatImplausibleCalibrationMessage,
  instanceGeometryFromPx,
  parseQtyRule,
  resolveQty,
  isGeometryDependentQtyRule,
  type Instance as DomainInstance,
  type Variant as DomainVariant,
} from "@overlord/boq";

const RAIL: readonly { icon: IconName; label: string; cap?: keyof Capabilities; scale?: boolean }[] = [
  { icon: "Select", label: "Select" },
  { icon: "Pan", label: "Pan" },
  { icon: "Zoom", label: "Zoom" },
  { icon: "Dimension", label: "Measure distance", scale: true },
  { icon: "Rectangle", label: "Measure area", scale: true },
  { icon: "Line", label: "Line", cap: "threeD" },
  { icon: "Circle", label: "Circle", cap: "threeD" },
  { icon: "Polygon", label: "Polygon", cap: "threeD" },
  { icon: "Text", label: "Text" },
  { icon: "Eyedropper", label: "Eyedropper", cap: "threeD" },
];

const PRIMITIVES: readonly IconName[] = [
  "Box", "Sphere", "Cylinder", "Cone", "Plane",
  "Line-Points", "Rectangle", "Circle", "Arc", "Extrude-Plus", "Boolean",
];

const SNAPS: readonly { icon: IconName; label: string; core: boolean }[] = [
  { icon: "Snap-Grid", label: "Snap to grid", core: true },
  { icon: "Snap-Object", label: "Snap to object", core: true },
  { icon: "Snap-Angle", label: "Snap to angle", core: false },
  { icon: "Snap-Intersection", label: "Snap to intersection", core: false },
  { icon: "Snap-Tangent", label: "Snap to tangent", core: false },
  { icon: "Snap-Smart-Points", label: "Smart points", core: false },
];

const UNITS: readonly { value: LengthUnit; label: string }[] = [
  { value: "m", label: "m" },
  { value: "ft", label: "ft" },
  { value: "cm", label: "cm" },
  { value: "mm", label: "mm" },
  { value: "in", label: "in" },
];

export interface EditorShellProps {
  caps?: Capabilities;
  reference?: boolean;
  status?: string;
  projectName?: string;
  projectId?: string;
  onBackToProjects?: () => void;
}

export function EditorShell({
  caps = MVP,
  reference = false,
  status = "",
  projectName,
  projectId,
  onBackToProjects,
}: EditorShellProps) {
  const [theme, setTheme] = useState<Theme>("light");
  const [canvasMode, setCanvasMode] = useState<CanvasMode>(SELECT_TOOL);
  const [mode, setMode] = useState(caps.threeD ? "3d" : "plan");
  const [leftTab, setLeftTab] = useState("Tool Sets");
  const [oipTab, setOipTab] = useState("Shape");
  const [snaps, setSnaps] = useState<string[]>([]);

  const [mapState, setMapState] = useState<MapState>("no_map");
  const [baseMap, setBaseMap] = useState<BaseMapDto | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadHint, setUploadHint] = useState<string | null>(null);
  const [replaceModalOpen, setReplaceModalOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [knownDistance, setKnownDistance] = useState("");
  const [knownUnit, setKnownUnit] = useState<LengthUnit>("m");
  const [calError, setCalError] = useState<string | null>(null);
  const [implausible, setImplausible] = useState<{ impliedWidthM: number } | null>(null);
  const [savingCal, setSavingCal] = useState(false);

  const [packages, setPackages] = useState<CataloguePackage[]>([]);
  const [showCatalog, setShowCatalog] = useState<CatalogueShowItem[]>([]);
  const [layoutShowItems, setLayoutShowItems] = useState<LayoutShowItem[]>([]);
  const [packageQuery, setPackageQuery] = useState("");
  const [showQuery, setShowQuery] = useState("");
  const [variants, setVariants] = useState<LayoutVariant[]>([]);
  const [instances, setInstances] = useState<LayoutInstance[]>([]);
  const [measureMarks, setMeasureMarks] = useState<LayoutMeasurement[]>([]);
  const [layoutId, setLayoutId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const historyRef = useRef(new History());
  const [, setHistTick] = useState(0);
  const bumpHist = () => setHistTick((n) => n + 1);

  const calibrated = mapState === "calibrated";
  const mapPresentUncalibrated = mapState === "map_uncalibrated";
  const pendingPackageId = canvasMode.kind === "place" ? canvasMode.packageId : null;
  const calPhase = canvasMode.kind === "calibrate" ? canvasMode.phase : "idle";
  const calPoints = canvasMode.kind === "calibrate" ? canvasMode.points : [];
  const tool = railToolOf(canvasMode);
  const canvasTool = dataToolOf(canvasMode);

  function adoptCanvasMode(next: CanvasMode) {
    setCanvasMode(next);
    if (next.kind !== "calibrate") {
      setKnownDistance("");
      setCalError(null);
      setImplausible(null);
    }
  }

  const refreshLayout = useCallback(async () => {
    if (!projectId) return;
    try {
      const layout = await api.projects.layout(projectId);
      setMapState(layout.mapState);
      setBaseMap(layout.baseMap);
      setLayoutId(layout.layout.id);
      setVariants(layout.variants ?? []);
      setInstances(layout.instances ?? []);
      setMeasureMarks(layout.measurements ?? []);
      setLayoutShowItems(layout.showItems ?? []);
      setUploadHint(null);
    } catch (err) {
      if (err instanceof ApiError) setUploadHint(err.message);
    }
  }, [projectId]);

  useEffect(() => {
    /* Theme is booted app-wide in main.tsx; sync the toggle to that store. */
    setTheme(getTheme());
  }, []);

  useEffect(() => {
    void refreshLayout();
  }, [refreshLayout]);

  useEffect(() => {
    if (reference) return;
    void api.catalogue.packages().then((r) => {
      setPackages(r.packages);
      setShowCatalog(r.showItems ?? []);
    }).catch(() => {
      /* palette stays empty; placement still works once packages load */
    });
  }, [reference]);

  useEffect(() => {
    if (!layoutId) return;
    void putDraft({
      layoutId,
      savedAt: Date.now(),
      revision: instances.length + measureMarks.length,
      state: { instances, variants, measurements: measureMarks },
    });
  }, [layoutId, instances, variants, measureMarks]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
        || e.target instanceof HTMLSelectElement;
      if (e.key === "Escape") {
        e.preventDefault();
        adoptCanvasMode(SELECT_TOOL);
        return;
      }
      if (inField) return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) historyRef.current.redo();
        else historyRef.current.undo();
        bumpHist();
        return;
      }
      if ((e.key === "Backspace" || e.key === "Delete") && selectedId) {
        e.preventDefault();
        if (measureMarks.some((m) => m.id === selectedId)) void removeMeasurement(selectedId);
        else void removeInstance(selectedId);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function toggleTheme() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    applyTheme(next);
  }

  function cancelCalibrate() {
    adoptCanvasMode(SELECT_TOOL);
  }

  function startCalibrate() {
    if (mapState === "no_map") return;
    adoptCanvasMode({ kind: "calibrate", phase: "a", points: [] });
  }

  function onCalClick(pt: CalPoint) {
    setCanvasMode((m) => {
      if (m.kind !== "calibrate") return m;
      if (m.phase === "a") return { kind: "calibrate", phase: "b", points: [pt] };
      if (m.phase === "b") return { kind: "calibrate", phase: "confirm", points: [m.points[0]!, pt] };
      return m;
    });
  }

  function previewCheck() {
    if (calPoints.length !== 2 || !baseMap) return null;
    const dist = Number(knownDistance);
    if (!Number.isFinite(dist) || dist <= 0) return null;
    try {
      const scale = deriveScale({
        pointA: calPoints[0]!,
        pointB: calPoints[1]!,
        knownDistance: dist,
        knownUnit,
        calibratedAt: new Date().toISOString(),
        calibratedByUserId: "preview",
      });
      const segmentPx = distance(calPoints[0]!, calPoints[1]!);
      return calibrationLooksImplausible(scale, baseMap.widthPx, segmentPx);
    } catch {
      return null;
    }
  }

  async function commitCalibration(acceptImplausible = false) {
    if (!projectId || calPoints.length !== 2) return;
    const dist = Number(knownDistance);
    if (!Number.isFinite(dist) || dist <= 0) {
      setCalError("Enter a positive distance");
      return;
    }
    const local = previewCheck();
    if (local?.implausible && !acceptImplausible) {
      // A soft warning is not an error. It is already shown in the calibrate
      // dialog; writing it to calError too rendered the same sentence twice,
      // in two different layouts (QA-18).
      setImplausible({ impliedWidthM: local.impliedWidthM });
      return;
    }
    setSavingCal(true);
    setCalError(null);
    try {
      const res = await api.projects.calibrate(projectId, {
        pointA: calPoints[0]!,
        pointB: calPoints[1]!,
        knownDistance: dist,
        knownUnit,
        acceptImplausible,
      });
      setBaseMap(res.baseMap);
      setMapState(res.mapState);
      adoptCanvasMode(SELECT_TOOL);
    } catch (err) {
      if (err instanceof ApiError && err.code === "implausible_scale") {
        setImplausible({
          impliedWidthM: previewCheck()?.impliedWidthM ?? 0,
        });
        setCalError(err.message);
      } else if (err instanceof ApiError) {
        setCalError(err.message);
      } else {
        setCalError("Could not save calibration");
      }
    } finally {
      setSavingCal(false);
    }
  }

  async function runUpload(file: File) {
    if (!projectId) return;

    setUploadBusy(true);
    setUploadProgress(0);
    setUploadHint(null);
    try {
      /* Snapshot before any other await — File from <input> can go stale after
         the input is cleared or after a dialog yield (see JOURNAL 2026-08-14). */
      const snapshot = await snapshotFile(file);
      const { prepareBasemapFile } = await import("../lib/prepare-basemap.js");
      const prepared = await prepareBasemapFile(snapshot);
      if (!prepared.ok) {
        setUploadHint(prepared.message);
        return;
      }

      const pre = await api.projects.basemapPresign(projectId, {
        mimeType: prepared.mimeType,
        byteSize: prepared.blob.size,
        fileName: snapshot.name,
      });
      await putToPresignedUrl(pre.uploadUrl, prepared.blob, pre.headers, setUploadProgress);
      const conf = await api.projects.basemapConfirm(projectId, {
        objectKey: pre.objectKey,
        mimeType: prepared.mimeType,
        widthPx: prepared.widthPx,
        heightPx: prepared.heightPx,
        pageCount: prepared.pageCount,
        sourcePage: prepared.sourcePage,
      });
      setBaseMap(conf.baseMap);
      setMapState(conf.mapState);
      /* Prompt — not a hard gate (F4.1). Adopting calibrate drops any live place. */
      adoptCanvasMode({ kind: "calibrate", phase: "a", points: [] });
    } catch (err) {
      setUploadHint(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploadBusy(false);
      setUploadProgress(null);
    }
  }

  function requestUpload() {
    if (!projectId || uploadBusy) return;
    if (baseMap) {
      setReplaceModalOpen(true);
      return;
    }
    fileRef.current?.click();
  }

  function confirmReplaceAndPick() {
    setReplaceModalOpen(false);
    /* Open picker after the modal closes so the File never sits behind a yield. */
    queueMicrotask(() => fileRef.current?.click());
  }

  const modeSegments: readonly Segment[] = [
    { id: "plan", label: "2D" },
    { id: "3d", label: "3D", disabled: !caps.threeD, title: caps.threeD ? "3D" : NOT_YET },
  ];

  const pageNote =
    baseMap?.pageCount != null && baseMap.pageCount > 1
      ? `Using page ${baseMap.sourcePage} of ${baseMap.pageCount}.`
      : null;

  const distanceOk = isPositiveDistance(knownDistance);
  const preview = previewCheck();
  const impliedPreview = preview?.impliedWidthM ?? null;
  const softWarn = Boolean(preview?.implausible || implausible || calError);
  const shellClass = !calibrated ? "app-shell is-uncalibrated" : "app-shell";

  const scale = baseMap?.scale ? { mmPerPixel: baseMap.scale.mmPerPixel } : null;
  const pendingPkg = packages.find((p) => p.packageId === pendingPackageId) ?? null;
  const selectedMark = measureMarks.find((m) => m.id === selectedId) ?? null;
  const selected = selectedMark ? null : instances.find((i) => i.id === selectedId) ?? null;
  const selectedVariant = selected
    ? variants.find((v) => v.id === selected.variantId) ?? null
    : null;
  const blastCount = selectedVariant
    ? instances.filter((i) => i.variantId === selectedVariant.id).length
    : 0;
  const knownUnitRaw = baseMap?.calibration?.knownUnit;
  const primaryUnit: LengthUnit =
    knownUnitRaw === "mm" || knownUnitRaw === "cm" || knownUnitRaw === "m"
      || knownUnitRaw === "ft" || knownUnitRaw === "in"
      ? knownUnitRaw
      : "m";
  const selectedMarkLabel = selectedMark
    ? inspectorMeasureLabel(selectedMark.points, scale, primaryUnit)
    : null;

  async function placeAt(pt: { x: number; y: number }) {
    if (!projectId || !pendingPkg) return;
    const size = defaultFootprintPx(scale);
    const id = crypto.randomUUID();
    const pkg = pendingPkg;
    historyRef.current.execute({
      label: `Place ${pkg.name}`,
      do() {
        void api.projects
          .placeInstance(projectId, {
            id,
            packageId: pkg.packageId,
            xPx: pt.x,
            yPx: pt.y,
            widthPx: size.widthPx,
            heightPx: size.heightPx,
          })
          .then((res) => {
            setInstances((prev) =>
              prev.some((i) => i.id === res.instance.id) ? prev : [...prev, res.instance],
            );
            setVariants((prev) => {
              const rest = prev.filter((v) => v.id !== res.variant.id);
              return [...rest, res.variant];
            });
            setSelectedId(res.instance.id);
          })
          .catch((err: unknown) => {
            setUploadHint(err instanceof ApiError ? err.message : "Could not place package");
          });
      },
      undo() {
        setInstances((prev) => prev.filter((i) => i.id !== id));
        setSelectedId((cur) => (cur === id ? null : cur));
        void api.projects.deleteInstance(projectId, id);
      },
    });
    bumpHist();
  }

  function moveInstance(id: string, xPx: number, yPx: number) {
    const prev = instances.find((i) => i.id === id);
    if (!prev || !projectId) return;
    const from = { xPx: prev.xPx, yPx: prev.yPx };
    historyRef.current.execute({
      label: "Move",
      do() {
        setInstances((list) => list.map((i) => (i.id === id ? { ...i, xPx, yPx } : i)));
        void api.projects.patchInstance(projectId, id, { xPx, yPx });
      },
      undo() {
        setInstances((list) => list.map((i) => (i.id === id ? { ...i, ...from } : i)));
        void api.projects.patchInstance(projectId, id, from);
      },
    });
    bumpHist();
  }

  function patchSelected(patch: Partial<LayoutInstance>) {
    if (!selected || !projectId) return;
    const id = selected.id;
    const before = { ...selected };
    const after = { ...selected, ...patch };
    historyRef.current.execute({
      label: "Edit placement",
      do() {
        setInstances((list) => list.map((i) => (i.id === id ? after : i)));
        void api.projects.patchInstance(projectId, id, patch);
      },
      undo() {
        setInstances((list) => list.map((i) => (i.id === id ? before : i)));
        void api.projects.patchInstance(projectId, id, {
          xPx: before.xPx,
          yPx: before.yPx,
          widthPx: before.widthPx,
          heightPx: before.heightPx,
          rotationDeg: before.rotationDeg,
          params: before.params,
        });
      },
    });
    bumpHist();
  }

  function removeInstance(id: string) {
    if (!projectId) return;
    const prev = instances.find((i) => i.id === id);
    if (!prev) return;
    const pkgId = variants.find((v) => v.id === prev.variantId)?.packageId;
    historyRef.current.execute({
      label: "Delete placement",
      do() {
        setInstances((list) => list.filter((i) => i.id !== id));
        setSelectedId((cur) => (cur === id ? null : cur));
        void api.projects.deleteInstance(projectId, id);
      },
      undo() {
        if (!pkgId) return;
        void api.projects
          .placeInstance(projectId, {
            id: prev.id,
            packageId: pkgId,
            xPx: prev.xPx,
            yPx: prev.yPx,
            rotationDeg: prev.rotationDeg,
            params: prev.params,
            ...(prev.widthPx != null ? { widthPx: prev.widthPx } : {}),
            ...(prev.heightPx != null ? { heightPx: prev.heightPx } : {}),
          })
          .then((res) => {
            setInstances((list) =>
              list.some((i) => i.id === res.instance.id) ? list : [...list, res.instance],
            );
          });
      },
    });
    bumpHist();
  }

  function addShowItem(itemCode: string) {
    if (!projectId) return;
    void api.projects.addShowItem(projectId, { itemCode, qty: 1 }).then((res) => {
      setLayoutShowItems((prev) => {
        const rest = prev.filter((s) => s.id !== res.showItem.id);
        return [...rest, res.showItem];
      });
    }).catch((err: unknown) => {
      setUploadHint(err instanceof ApiError ? err.message : "Could not add show item");
    });
  }

  function patchShowQty(id: string, qty: number) {
    if (!projectId) return;
    setLayoutShowItems((list) => list.map((s) => (s.id === id ? { ...s, qty } : s)));
    void api.projects.patchShowItem(projectId, id, { qty }).catch((err: unknown) => {
      setUploadHint(err instanceof ApiError ? err.message : "Could not update quantity");
    });
  }

  function removeShowItem(id: string) {
    if (!projectId) return;
    setLayoutShowItems((list) => list.filter((s) => s.id !== id));
    void api.projects.deleteShowItem(projectId, id).catch((err: unknown) => {
      setUploadHint(err instanceof ApiError ? err.message : "Could not remove show item");
    });
  }

  function commitMeasure(points: { x: number; y: number }[]) {
    if (!projectId || points.length < 2) return;
    const id = crypto.randomUUID();
    historyRef.current.execute({
      label: "Measure",
      do() {
        void api.projects
          .placeMeasurement(projectId, { id, points })
          .then((res) => {
            setMeasureMarks((prev) =>
              prev.some((m) => m.id === res.measurement.id) ? prev : [...prev, res.measurement],
            );
            setSelectedId(res.measurement.id);
          })
          .catch((err: unknown) => {
            setUploadHint(err instanceof ApiError ? err.message : "Could not save measurement");
          });
      },
      undo() {
        setMeasureMarks((prev) => prev.filter((m) => m.id !== id));
        setSelectedId((cur) => (cur === id ? null : cur));
        void api.projects.deleteMeasurement(projectId, id);
      },
    });
    bumpHist();
  }

  function onMeasureClick(pt: { x: number; y: number }) {
    if (canvasMode.kind !== "measure") return;
    const next = [...canvasMode.points, pt];
    if (next.length >= 2) {
      commitMeasure(next);
      adoptCanvasMode({ kind: "measure", points: [] });
    } else {
      adoptCanvasMode({ kind: "measure", points: next });
    }
  }

  function removeMeasurement(id: string) {
    if (!projectId) return;
    const prev = measureMarks.find((m) => m.id === id);
    if (!prev) return;
    historyRef.current.execute({
      label: "Delete measurement",
      do() {
        setMeasureMarks((list) => list.filter((m) => m.id !== id));
        setSelectedId((cur) => (cur === id ? null : cur));
        void api.projects.deleteMeasurement(projectId, id);
      },
      undo() {
        void api.projects
          .placeMeasurement(projectId, { id: prev.id, points: prev.points })
          .then((res) => {
            setMeasureMarks((list) =>
              list.some((m) => m.id === res.measurement.id) ? list : [...list, res.measurement],
            );
          });
      },
    });
    bumpHist();
  }

  const geom = selected
    ? instanceGeometryFromPx(selected.widthPx, selected.heightPx, scale)
    : { areaSqft: null, lengthRft: null };
  const qtyRows =
    selected && selectedVariant
      ? selectedVariant.lines
          .filter((l) => l.included)
          .map((line) => {
            const rule = parseQtyRule(line.qtyRule);
            const asLine = {
              itemCode: line.itemCode,
              rule,
              qtyValue: line.qtyValue,
              flag: line.flag as "MANDATORY" | "DEFAULT_ON" | "OPTIONAL",
              included: line.included,
              overrideDays: null,
            };
            const asVariant: DomainVariant = {
              variantId: selectedVariant.id,
              packageId: selectedVariant.packageId,
              name: selectedVariant.name,
              templateVersion: String(selectedVariant.templateVersion),
              lines: [],
            };
            const asInst: DomainInstance = {
              instanceId: selected.id,
              variantId: selected.variantId,
              geometry: geom,
              params: selected.params,
            };
            const { qty } = resolveQty(asLine, asVariant, asInst);
            return { line, qty, rule };
          })
      : [];

  const modeHint = modeBarHint({
    canvasMode,
    mapState,
    placingName: pendingPkg?.name ?? null,
  });

  let statusMsg = "Ready";
  if (mapState === "no_map") statusMsg = "No venue plan — count-only quoting is fine";
  else if (mapPresentUncalibrated) statusMsg = "Plan uploaded — scale not set; area/length quantities are meaningless";
  else if (calibrated && baseMap?.scale) {
    statusMsg = `Scale · 1 px ≈ ${baseMap.scale.mmPerPixel.toFixed(2)} mm`;
  }

  return (
    <div className={shellClass}>
      {reference ? <span className="ref-ribbon">Reference · V2 as designed</span> : null}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void runUpload(f);
        }}
      />

      <Modal
        open={replaceModalOpen}
        title="Replace venue plan?"
        confirmLabel="Replace plan"
        danger
        onCancel={() => setReplaceModalOpen(false)}
        onConfirm={confirmReplaceAndPick}
      >
        <p>
          Replacing the plan will clear the scale. You&apos;ll need to calibrate
          again.
        </p>
      </Modal>

      <header className="menubar">
        <span className="menubar__logo"><Icon name="Select" size={16} tone="onAccent" /></span>
        {onBackToProjects ? (
          <Button variant="ghost" size="sm" onClick={onBackToProjects}>
            Projects
          </Button>
        ) : null}
        {projectName ? <span className="title projects__brand">{projectName}</span> : null}
        <AppMenubar enabled={caps.appMenus} />

        <div className="menubar__search">
          <Search
            placeholder="Quick Search…"
            disabled={!caps.commandPalette}
            title={caps.commandPalette ? "Quick Search" : "Command palette arrives in a later release"}
          />
          <kbd>⌘K</kbd>
        </div>

        <div className="menubar__actions">
          <span className="avatar-stack">
            <Avatar initials="JP" colour="pink" />
            {caps.presence ? (
              <>
                <Avatar initials="AK" colour="blue" />
                <Avatar initials="MS" colour="purple" />
              </>
            ) : null}
          </span>
          <Button
            variant="primary"
            size="sm"
            disabled={!caps.sharing}
            title={caps.sharing ? "Share" : NOT_YET}
          >
            Share
          </Button>
          <DividerV />
          <Segmented
            segments={[{ id: "light", label: "☀" }, { id: "dark", label: "☾" }]}
            value={theme}
            onChange={toggleTheme}
          />
        </div>
      </header>

      <div className="viewbar">
        <IconButton
          icon="Undo"
          // QA-20: keep the verb. A button announced as "Place Box Office"
          // reads as one that PLACES, which is the opposite of what it does.
          label={
            historyRef.current.nextUndoLabel
              ? `Undo ${historyRef.current.nextUndoLabel}`
              : "Undo"
          }
          disabled={!historyRef.current.canUndo}
          onClick={() => {
            historyRef.current.undo();
            bumpHist();
          }}
        />
        <IconButton
          icon="Redo"
          label={
            historyRef.current.nextRedoLabel
              ? `Redo ${historyRef.current.nextRedoLabel}`
              : "Redo"
          }
          disabled={!historyRef.current.canRedo}
          onClick={() => {
            historyRef.current.redo();
            bumpHist();
          }}
        />
        <DividerV />
        <DropdownSelect
          prefix="View:" value="saved"
          disabled={!caps.cadOrganisation}
          title={caps.cadOrganisation ? "Saved Views" : NOT_YET}
          options={[
            { value: "saved", label: "Saved Views" },
            { value: "none", label: "None" },
          ]}
        />
        <DropdownSelect
          prefix="Zone:" value="all"
          disabled={!caps.cadOrganisation}
          title={caps.cadOrganisation ? "Zone" : NOT_YET}
          options={[{ value: "all", label: "All zones" }]}
        />
        <DropdownSelect
          prefix="Level:" value="ground"
          disabled={!caps.cadOrganisation}
          title={caps.cadOrganisation ? "Level" : NOT_YET}
          options={[{ value: "ground", label: "Ground" }]}
        />
        <DropdownSelect
          prefix="Plane:" value="layer"
          disabled={!caps.cadOrganisation}
          title={caps.cadOrganisation ? "Plane" : NOT_YET}
          options={[{ value: "layer", label: caps.threeD ? "Layer Plane" : "Plan" }]}
        />
        <DividerV />
        <Segmented segments={modeSegments} value={mode} onChange={setMode} />
        <DropdownSelect
          prefix="Render:" value="flat"
          disabled={!caps.threeD}
          title={caps.threeD ? "Render" : NOT_YET}
          options={[{ value: "flat", label: caps.threeD ? "Shaded" : "Flat" }]}
        />
        <span className="viewbar__spacer" />
        {projectId ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              disabled={uploadBusy || !projectId}
              onClick={requestUpload}
            >
              {baseMap ? "Replace plan" : "Upload plan"}
            </Button>
            {baseMap ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={calPhase !== "idle"}
                onClick={startCalibrate}
              >
                {calibrated ? "Recalibrate" : "Set scale"}
              </Button>
            ) : null}
          </>
        ) : null}
        <DropdownSelect prefix="Zoom:" label="Zoom level" value="100" options={[{ value: "100", label: "100%" }]} />
        <IconButton icon="Flyover" label={caps.threeD ? "Flyover" : NOT_YET} disabled={!caps.threeD} />
        <IconButton
          icon="Fit"
          label={caps.drawingAids ? "Fit to window" : `Fit to window — ${AIDS_NOT_YET}`}
          disabled={!caps.drawingAids}
        />
      </div>

      {mapPresentUncalibrated && calPhase === "idle" ? (
        <div className="banner banner--warning" role="status">
          <span>
            Venue plan is uncalibrated — area and length quantities are meaningless until you set
            the scale.
          </span>
          <span className="banner__action">
            <Button variant="ghost" size="sm" onClick={startCalibrate}>
              Set scale
            </Button>
          </span>
        </div>
      ) : null}

      <div className="modebar">
        {caps.solidModelling ? (
          <>
            <Segmented
              segments={[
                { id: "screen", label: "Screen Plane" },
                { id: "layer", label: "Layer Plane" },
                { id: "auto", label: "Auto Plane" },
              ]}
              value="layer"
            />
            <DividerV />
            <span className="modebar__label">Push/Pull:</span>
            <Segmented
              segments={[{ id: "add", label: "Add Solid" }, { id: "sub", label: "Subtract Solid" }]}
              value="add"
            />
            <DividerV />
            <span className="modebar__hint">U · I · O · P cycle modes</span>
          </>
        ) : calPhase === "confirm" ? (
          <>
            <span className="modebar__label">Scale:</span>
            <span className="modebar__hint">
              Enter the real distance between the two points you clicked.
            </span>
          </>
        ) : (
          <>
            <span className="modebar__label">
              {canvasMode.kind === "calibrate" ? "Calibrate" : `${canvasTool}:`}
            </span>
            <span className="modebar__hint">{modeHint}</span>
            {canvasMode.kind === "calibrate" ? (
              <Button variant="ghost" size="sm" onClick={cancelCalibrate}>
                Cancel
              </Button>
            ) : null}
          </>
        )}
        <span className="modebar__spacer" />
        {uploadProgress != null ? (
          <span className="modebar__hint numeric">
            Uploading {Math.round(uploadProgress * 100)}%
          </span>
        ) : null}
        {uploadHint ? (
          <span className="modebar__hint" role="alert">
            {uploadHint}
          </span>
        ) : null}
        <span className="modebar__prefs">
          <IconButton
            icon="Grid"
            label={caps.drawingAids ? "Show grid" : `Show grid — ${AIDS_NOT_YET}`}
            size="sm"
            disabled={!caps.drawingAids}
          />
          <IconButton
            icon="QP-Rulers"
            label={caps.drawingAids ? "Show rulers" : `Show rulers — ${AIDS_NOT_YET}`}
            size="sm"
            disabled={!caps.drawingAids}
          />
          <IconButton
            icon="QP-Page-Boundary"
            label={caps.drawingAids ? "Show page boundary" : `Show page boundary — ${AIDS_NOT_YET}`}
            size="sm"
            disabled={!caps.drawingAids}
          />
        </span>
      </div>

      <div className="workspace">
        <div className="panel-left">
          <nav className="tool-rail" aria-label="Tools">
            {RAIL.map((t) => {
              const capOff = t.cap ? !caps[t.cap] : false;
              const isArea = t.label === "Measure area";
              const needsScale = Boolean(t.scale) && !calibrated;
              const disabled = capOff || isArea || needsScale;
              const title = capOff
                ? `${t.label} — ${NOT_YET}`
                : isArea
                  ? `${t.label} — ${calibrated ? AREA_LATER : SCALE_FIRST}`
                  : needsScale
                    ? `${t.label} — ${SCALE_FIRST}`
                    : t.label;
              return (
                <IconButton
                  key={t.label}
                  icon={t.icon}
                  label={title}
                  active={tool === t.label}
                  disabled={disabled}
                  requiresScale={t.scale ?? false}
                  onClick={() => {
                    if (t.label === "Measure distance") {
                      adoptCanvasMode({ kind: "measure", points: [] });
                      return;
                    }
                    adoptCanvasMode({ kind: "tool", tool: t.label });
                  }}
                />
              );
            })}
          </nav>

          <div className="panel-left__sections">
            <Tabs>
              {["Tool Sets", "Layers", "Assets", "Show"].map((t) => (
                <Tab key={t} label={t} active={leftTab === t} onSelect={() => setLeftTab(t)} />
              ))}
            </Tabs>

            <ScrollArea>
            {leftTab === "Tool Sets" ? (
              <Section>
                <SectionHeader title="Show elements" />
                <div className="tool-grid">
                  {[
                    { icon: "Slab" as IconName, label: "Stage" },
                    { icon: "Column" as IconName, label: "Truss" },
                    { icon: "Rectangle" as IconName, label: "Counter" },
                    { icon: "Wall" as IconName, label: "Barricade" },
                    { icon: "Box" as IconName, label: "Generator" },
                    { icon: "Door" as IconName, label: "Entry" },
                    { icon: "Stair" as IconName, label: "Ramp" },
                    { icon: "Roof" as IconName, label: "Cover" },
                  ].map((t) => (
                    <ToolChip key={t.label} icon={t.icon} label={t.label} />
                  ))}
                </div>
                {caps.threeD ? (
                  <>
                    <SectionHeader title="3D Modeling" />
                    <div className="tool-grid">
                      {(["Extrude", "Sweep", "Loft", "Solids", "NURBS", "Deform"] as IconName[]).map((n) => (
                        <ToolChip key={n} icon={n} label={n} />
                      ))}
                    </div>
                  </>
                ) : null}
              </Section>
            ) : null}

            {leftTab === "Layers" ? (
              <Section>
                <SectionHeader title="Zones & levels">
                  <IconButton
                    icon="Plus"
                    label={caps.cadOrganisation ? "Add zone" : `Add zone — ${ZONES_NOT_YET}`}
                    size="sm"
                    disabled={!caps.cadOrganisation}
                  />
                </SectionHeader>
                <LayerRow name="Ground" colour="blue" ordinal={1} active />
                <p className="panel-hint">No zones yet. Zones group BOQ subtotals.</p>
              </Section>
            ) : null}

            {leftTab === "Assets" ? (
              <AssetsPalette
                packages={packages}
                query={packageQuery}
                onQuery={setPackageQuery}
                onPlace={(packageId) => {
                  adoptCanvasMode({ kind: "place", packageId });
                  setLeftTab("Assets");
                }}
              />
            ) : null}

            {leftTab === "Show" ? (
              <ShowItemTray
                catalog={showCatalog}
                placed={layoutShowItems}
                query={showQuery}
                onQuery={setShowQuery}
                onAdd={addShowItem}
                onQty={patchShowQty}
                onRemove={removeShowItem}
              />
            ) : null}
            </ScrollArea>
          </div>
        </div>

        <main className="canvas" data-tool={canvasTool}>
          <CanvasStage
            mapState={mapState}
            imageUrl={baseMap?.viewUrl ?? null}
            imageWidth={baseMap?.widthPx ?? 0}
            imageHeight={baseMap?.heightPx ?? 0}
            impliedWidthM={baseMap?.impliedWidthM ?? null}
            scaleMmPerPx={baseMap?.scale?.mmPerPixel ?? null}
            canvasMode={canvasMode}
            onCalClick={onCalClick}
            onUploadClick={requestUpload}
            uploadBusy={uploadBusy}
            uploadHint={uploadHint}
            pageNote={pageNote}
            instances={instances}
            measurements={measureMarks}
            selectedId={selectedId}
            measureUnit={primaryUnit}
            onPlace={placeAt}
            onMeasureClick={onMeasureClick}
            onSelectInstance={(id) => {
              setSelectedId(id);
              if (id && canvasMode.kind === "place") adoptCanvasMode(SELECT_TOOL);
            }}
            onMoveInstance={moveInstance}
          />

          {calPhase === "confirm" ? (
            <div className="cal-dialog" role="dialog" aria-label="Set scale">
              <p className="cal-dialog__title">Set scale</p>
              <div className="cal-dialog__row">
                <Field
                  label="Known distance"
                  numeric
                  autoFocus
                  value={knownDistance}
                  onChange={(e) => setKnownDistance(e.target.value)}
                />
                <Select
                  label="Unit"
                  value={knownUnit}
                  onChange={(v) => setKnownUnit(v as LengthUnit)}
                  options={UNITS.map((u) => ({ value: u.value, label: u.label }))}
                />
              </div>

              {preview?.implausible ? (
                <p className="cal-dialog__warn" role="status">
                  {formatImplausibleCalibrationMessage(preview)}
                </p>
              ) : impliedPreview != null ? (
                <p className="cal-dialog__implied numeric" role="status">
                  This plan would be about {Math.round(impliedPreview)} m wide.
                </p>
              ) : (
                <p className="cal-dialog__implied">
                  Every quantity is derived from this. Check it looks right.
                </p>
              )}

              {calError ? (
                <p className="cal-dialog__error" role="alert">
                  {calError}
                </p>
              ) : null}

              <div className="cal-dialog__actions">
                <Button variant="ghost" size="sm" onClick={cancelCalibrate}>
                  Cancel
                </Button>
                {softWarn && distanceOk ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={savingCal || !distanceOk}
                    onClick={() => void commitCalibration(true)}
                  >
                    Use anyway
                  </Button>
                ) : null}
                <Button
                  variant="primary"
                  size="sm"
                  disabled={savingCal || !distanceOk}
                  onClick={() => void commitCalibration(false)}
                >
                  Confirm
                </Button>
              </div>
            </div>
          ) : null}

          <FloatingToolbar position="top">
            {PRIMITIVES.map((n) => (
              <IconButton
                key={n} icon={n} label={caps.threeD ? n : `${n} — ${NOT_YET}`}
                disabled={!caps.threeD}
              />
            ))}
          </FloatingToolbar>

          <div className="data-bar">
            <DataField
              label="W"
              value={
                mapState === "calibrated" && baseMap?.impliedWidthM != null
                  ? `${Math.round(baseMap.impliedWidthM)} m`
                  : "—"
              }
            />
            <DataField label="∠" value="—" />
            <DataField label="X" value="—" />
            <DataField label="Y" value="—" />
          </div>

          <div className="canvas__gizmo">
            <Segmented segments={modeSegments} value={mode} onChange={setMode} />
          </div>
        </main>

        <aside className="panel-right scroll-y">
          <div className="oip__header">
            <span className="oip__eyebrow">
              {selectedMark || canvasMode.kind === "measure" ? "Measurement" : "Instance"}
            </span>
            <span className="oip__title">
              {selectedMark
                ? (selectedMarkLabel ?? "Distance")
                : canvasMode.kind === "measure"
                  ? "Measuring distance"
                  : selectedVariant?.name ?? (pendingPkg ? `Place ${pendingPkg.name}` : "Nothing selected")}
            </span>
            <Badge tone={mode === "plan" ? "blue" : "ink"}>{mode === "plan" ? "2D" : "3D"}</Badge>
          </div>
          {selectedMark ? (
            <Section>
              <SectionHeader title="This mark" />
              <p className="numeric">{selectedMarkLabel ?? "—"}</p>
              <p className="panel-hint">Informational — not a quote line.</p>
              <Button
                variant="danger"
                size="sm"
                onClick={() => removeMeasurement(selectedMark.id)}
              >
                Delete measurement
              </Button>
              <p className="panel-hint">Backspace also deletes.</p>
            </Section>
          ) : null}
          {selectedVariant && blastCount > 0 && !selectedMark ? (
            <p className="panel-hint" role="status">
            {blastCount === 1
              ? "1 placement uses this kit"
              : `${blastCount} placements use this kit`}
            </p>
          ) : null}
          {selectedMark ? null : (
          <Tabs>
            {["Shape", "Data", "Notes"].map((t) => (
              <Tab key={t} label={t} active={oipTab === t} onSelect={() => setOipTab(t)} />
            ))}
          </Tabs>
          )}

          {selectedMark ? null : (
          <>
          <Section>
            <SectionHeader title="Transform" />
            <div className="field-grid">
              <Field
                label="X"
                numeric
                key={`x-${selected?.id}-${selected ? Math.round(selected.xPx) : "none"}`}
                defaultValue={selected ? String(Math.round(selected.xPx)) : ""}
                disabled={!selected}
                onBlur={(e) => {
                  const n = Number(e.currentTarget.value);
                  if (selected && Number.isFinite(n)) patchSelected({ xPx: n });
                }}
              />
              <Field
                label="Y"
                numeric
                key={`y-${selected?.id}-${selected ? Math.round(selected.yPx) : "none"}`}
                defaultValue={selected ? String(Math.round(selected.yPx)) : ""}
                disabled={!selected}
                onBlur={(e) => {
                  const n = Number(e.currentTarget.value);
                  if (selected && Number.isFinite(n)) patchSelected({ yPx: n });
                }}
              />
              <Field label="Z" value="" numeric readOnly disabled={!caps.threeD} />
              <Field
                label="Width"
                numeric
                key={`w-${selected?.id}-${selected?.widthPx ?? "none"}`}
                defaultValue={selected?.widthPx != null ? String(Math.round(selected.widthPx)) : ""}
                disabled={!selected}
                onBlur={(e) => {
                  const n = Number(e.currentTarget.value);
                  if (selected && Number.isFinite(n) && n > 0) patchSelected({ widthPx: n });
                }}
              />
              <Field
                label="Depth"
                numeric
                key={`d-${selected?.id}-${selected?.heightPx ?? "none"}`}
                defaultValue={selected?.heightPx != null ? String(Math.round(selected.heightPx)) : ""}
                disabled={!selected}
                onBlur={(e) => {
                  const n = Number(e.currentTarget.value);
                  if (selected && Number.isFinite(n) && n > 0) patchSelected({ heightPx: n });
                }}
              />
              <Field label="Height" value="" numeric readOnly disabled={!caps.threeD} />
              <Field
                label="Rotation"
                numeric
                key={`r-${selected?.id}-${selected?.rotationDeg ?? "none"}`}
                defaultValue={selected ? String(selected.rotationDeg) : ""}
                disabled={!selected}
                onBlur={(e) => {
                  const n = Number(e.currentTarget.value);
                  if (selected && Number.isFinite(n)) patchSelected({ rotationDeg: n });
                }}
              />
              <Field label="Scale" value="" numeric readOnly />
            </div>
          </Section>

          {selected && Object.keys(selected.params).length > 0 ? (
            <Section>
              <SectionHeader title="This placement" />
              {Object.entries(selected.params).map(([key, val]) => (
                <Field
                  key={key}
                  label={key}
                  numeric
                  value={String(val)}
                  onBlur={(e) => {
                    const n = Number(e.currentTarget.value);
                    if (!Number.isFinite(n) || n < 0) return;
                    patchSelected({ params: { ...selected.params, [key]: n } });
                  }}
                />
              ))}
            </Section>
          ) : null}

          <Section>
            <SectionHeader title="Kit" />
            {selectedVariant ? (
              <ul className="kit-lines">
                {selectedVariant.lines.map((l) => (
                  <li key={l.itemCode} className="kit-lines__row">
                    <span className="kit-lines__name">{l.itemName}</span>
                    <Badge
                      tone={
                        l.flag === "MANDATORY"
                          ? "ink"
                          : l.flag === "DEFAULT_ON"
                            ? "blue"
                            : "orange"
                      }
                    >
                      {l.flag === "MANDATORY"
                        ? "Required"
                        : l.flag === "DEFAULT_ON"
                          ? "Included"
                          : "Optional"}
                    </Badge>
                    {!l.included ? (
                      <span className="kit-lines__off">off</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="panel-hint">Select a placement to see its kit. Flags are read-only here.</p>
            )}
          </Section>

          <Section>
            <SectionHeader title="Placement" />
            <Select label="Level" prefix="Level" value="ground"
              options={[{ value: "ground", label: "Ground" }]} />
            <Select label="Zone" prefix="Zone" value="none"
              options={[{ value: "none", label: "Unzoned" }]} />
          </Section>

          <Section>
            <SectionHeader title="Quantity" />
            {qtyRows.length === 0 ? (
              <p className="panel-hint">
                {mapPresentUncalibrated
                  ? "Scale not set — area and length quantities stay blank."
                  : "Select a placement to see derived quantities."}
              </p>
            ) : (
              <ul className="kit-lines">
                {qtyRows.map((row) => (
                  <li key={row.line.itemCode} className="kit-lines__row">
                    <span className="kit-lines__name">{row.line.itemName}</span>
                    <span className="numeric">
                      {row.qty == null ? "—" : row.qty}
                    </span>
                    {row.qty == null && isGeometryDependentQtyRule(row.rule.kind) ? (
                      <Badge tone="orange">Unquantifiable</Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Section>
          </>
          )}
        </aside>
      </div>

      <footer className="statusbar">
        <span className="statusbar__snaps">
          {SNAPS.map((s) => {
            const snapOff = !caps.snapping;
            const advancedOff = !s.core && !caps.advancedSnapping;
            const off = snapOff || advancedOff;
            const reason = snapOff ? SNAP_NOT_YET : NOT_YET;
            return (
              <IconButton
                key={s.label} icon={s.icon} size="sm"
                label={off ? `${s.label} — ${reason}` : s.label}
                active={!off && snaps.includes(s.label)}
                disabled={off}
                onClick={() =>
                  setSnaps((p) => p.includes(s.label) ? p.filter((x) => x !== s.label) : [...p, s.label])
                }
              />
            );
          })}
        </span>
        <DividerV />
        <span className="statusbar__message">{statusMsg}</span>
        <span className="statusbar__spacer" />
        {mapPresentUncalibrated ? <Badge tone="orange">Uncalibrated</Badge> : null}
        {calibrated ? <Badge tone="ink">Calibrated</Badge> : null}
        <span className="statusbar__coords numeric">X: — Y: —</span>
        <span className="statusbar__meta">{status}</span>
      </footer>
    </div>
  );
}
