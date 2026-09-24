/**
 * The Konva stage: grid, base map, pan/zoom, calibration clicks, scale bar.
 * Colours from readCanvasPalette() — never literals in Konva props.
 */
import { useEffect, useRef, useState } from "react";
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text } from "react-konva";
import type { Stage as KonvaStage } from "konva/lib/Stage.js";
import type { KonvaEventObject } from "konva/lib/Node.js";
import { onPaletteChange, readCanvasPalette, type CanvasPalette } from "../lib/canvas-colors.js";
import type { LayoutInstance, LayoutMeasurement } from "../lib/api.js";
import type { CalPoint, CanvasMode } from "../lib/canvas-mode.js";
import { canvasMeasureLabel } from "../lib/measure-label.js";
import type { LengthUnit } from "@overlord/boq";

export type { CalPoint };

const GRID = 40;

export type CanvasStageProps = {
  mapState: "no_map" | "map_uncalibrated" | "calibrated";
  imageUrl: string | null;
  imageWidth: number;
  imageHeight: number;
  /** Implied plan width in metres when calibrated — for scale bar. */
  impliedWidthM: number | null;
  scaleMmPerPx: number | null;
  /** Exclusive interaction. Place and calibrate cannot both be live (QA-19). */
  canvasMode: CanvasMode;
  onCalClick?: (pt: CalPoint) => void;
  onUploadClick?: () => void;
  uploadBusy?: boolean;
  uploadHint?: string | null;
  pageNote?: string | null;
  instances?: readonly LayoutInstance[];
  measurements?: readonly LayoutMeasurement[];
  selectedId?: string | null;
  measureUnit?: LengthUnit;
  onPlace?: (pt: CalPoint) => void;
  onMeasureClick?: (pt: CalPoint) => void;
  onSelectInstance?: (id: string | null) => void;
  onMoveInstance?: (id: string, xPx: number, yPx: number) => void;
};

export function CanvasStage({
  mapState,
  imageUrl,
  imageWidth,
  imageHeight,
  impliedWidthM,
  scaleMmPerPx,
  canvasMode,
  onCalClick,
  onUploadClick,
  uploadBusy = false,
  uploadHint = null,
  pageNote = null,
  instances = [],
  measurements = [],
  selectedId = null,
  measureUnit = "m",
  onPlace,
  onMeasureClick,
  onSelectInstance,
  onMoveInstance,
}: CanvasStageProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<KonvaStage>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [palette, setPalette] = useState<CanvasPalette | null>(null);
  const [view, setView] = useState({ x: 40, y: 40, scale: 0.4 });
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [hover, setHover] = useState<CalPoint | null>(null);
  const panning = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setPalette(readCanvasPalette());
    return onPaletteChange(setPalette);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry?.contentRect;
      if (r) setSize({ width: Math.floor(r.width), height: Math.floor(r.height) });
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!imageUrl) {
      setImg(null);
      setImageLoading(false);
      setImageFailed(false);
      return;
    }
    setImageLoading(true);
    setImageFailed(false);
    setImg(null);
    const el = new window.Image();
    el.crossOrigin = "anonymous";
    el.onload = () => {
      setImg(el);
      setImageLoading(false);
      if (imageWidth > 0 && size.width > 0) {
        const fit = Math.min(
          (size.width - 80) / imageWidth,
          (size.height - 80) / Math.max(imageHeight, 1),
          1,
        );
        setView({ x: 40, y: 40, scale: Number.isFinite(fit) && fit > 0 ? fit : 0.4 });
      }
    };
    el.onerror = () => {
      setImg(null);
      setImageLoading(false);
      setImageFailed(true);
    };
    el.src = imageUrl;
  }, [imageUrl, imageWidth, imageHeight, size.width, size.height]);

  const cols = Math.ceil(size.width / GRID);
  const rows = Math.ceil(size.height / GRID);
  const panMode = canvasMode.kind === "tool" && (canvasMode.tool === "Pan" || canvasMode.tool === "Zoom");
  const placing = canvasMode.kind === "place";
  const calibrating = canvasMode.kind === "calibrate";
  const measuring = canvasMode.kind === "measure";
  const calPoints = canvasMode.kind === "calibrate" ? canvasMode.points : [];
  const measurePts = canvasMode.kind === "measure" ? canvasMode.points : [];
  const scale = scaleMmPerPx != null ? { mmPerPixel: scaleMmPerPx } : null;

  function toImageSpace(sx: number, sy: number): CalPoint {
    return {
      x: (sx - view.x) / view.scale,
      y: (sy - view.y) / view.scale,
    };
  }

  function onWheel(e: KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const old = view.scale;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const next = Math.min(8, Math.max(0.05, old * (direction > 0 ? 1.1 : 1 / 1.1)));
    const mousePointTo = {
      x: (pointer.x - view.x) / old,
      y: (pointer.y - view.y) / old,
    };
    setView({
      scale: next,
      x: pointer.x - mousePointTo.x * next,
      y: pointer.y - mousePointTo.y * next,
    });
  }

  /* Screen-space scale bar: 10 m of real world, or 1 m if the plan is tiny. */
  const barRealM =
    scaleMmPerPx && impliedWidthM != null
      ? impliedWidthM >= 50
        ? 10
        : impliedWidthM >= 5
          ? 1
          : 0.5
      : null;
  const barScreenPx =
    barRealM != null && scaleMmPerPx != null && view.scale > 0
      ? (barRealM * 1000) / scaleMmPerPx * view.scale
      : 0;

  return (
    <div ref={hostRef} className="canvas__stage">
      {palette && size.width > 0 ? (
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          onWheel={onWheel}
          onMouseDown={(e) => {
            if (panMode || e.evt.button === 1) {
              panning.current = true;
              last.current = { x: e.evt.clientX, y: e.evt.clientY };
              return;
            }
            const stage = stageRef.current;
            const pos = stage?.getPointerPosition();
            if (!pos) return;
            const cls = typeof e.target.getClassName === "function" ? e.target.getClassName() : "";
            const nodeName = typeof e.target.name === "function" ? e.target.name() : "";
            const onInstance = cls === "Rect";
            const onMark = nodeName === "measure-mark";
            switch (canvasMode.kind) {
              case "place":
                if (onPlace && !onInstance) onPlace(toImageSpace(pos.x, pos.y));
                return;
              case "calibrate":
                onCalClick?.(toImageSpace(pos.x, pos.y));
                return;
              case "measure":
                onMeasureClick?.(toImageSpace(pos.x, pos.y));
                return;
              case "tool":
                if (canvasMode.tool === "Select" && !onInstance && !onMark) onSelectInstance?.(null);
            }
          }}
          onMouseMove={(e) => {
            if (measuring) {
              const stage = stageRef.current;
              const pos = stage?.getPointerPosition();
              if (pos) setHover(toImageSpace(pos.x, pos.y));
            }
            if (!panning.current) return;
            const dx = e.evt.clientX - last.current.x;
            const dy = e.evt.clientY - last.current.y;
            last.current = { x: e.evt.clientX, y: e.evt.clientY };
            setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
          }}
          onMouseUp={() => {
            panning.current = false;
          }}
          onMouseLeave={() => {
            panning.current = false;
          }}
        >
          <Layer listening={false}>
            {Array.from({ length: cols + 1 }, (_, i) => (
              <Line
                key={`v${i}`}
                points={[i * GRID, 0, i * GRID, size.height]}
                stroke={palette.grid}
                strokeWidth={1}
              />
            ))}
            {Array.from({ length: rows + 1 }, (_, i) => (
              <Line
                key={`h${i}`}
                points={[0, i * GRID, size.width, i * GRID]}
                stroke={palette.grid}
                strokeWidth={1}
              />
            ))}
          </Layer>

          <Layer x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale}>
            {img ? (
              <KonvaImage image={img} width={imageWidth} height={imageHeight} listening={false} />
            ) : null}

            {/* Temp calibration geometry only while calibrating — not a permanent measure (QA-07). */}
            {calibrating && calPoints.length >= 1 ? (
              <Circle
                x={calPoints[0]!.x}
                y={calPoints[0]!.y}
                radius={6 / view.scale}
                fill={palette.selection}
              />
            ) : null}
            {calibrating && calPoints.length === 2 ? (
              <>
                <Line
                  points={[calPoints[0]!.x, calPoints[0]!.y, calPoints[1]!.x, calPoints[1]!.y]}
                  stroke={palette.selection}
                  strokeWidth={2 / view.scale}
                />
                <Circle
                  x={calPoints[1]!.x}
                  y={calPoints[1]!.y}
                  radius={6 / view.scale}
                  fill={palette.selection}
                />
              </>
            ) : null}

            {instances.map((inst) => {
              const w = inst.widthPx ?? 120;
              const h = inst.heightPx ?? 80;
              const selected = inst.id === selectedId;
              return (
                <Rect
                  key={inst.id}
                  x={inst.xPx}
                  y={inst.yPx}
                  width={w}
                  height={h}
                  rotation={inst.rotationDeg}
                  fill={palette.selectionSoft}
                  stroke={selected ? palette.selection : palette.border}
                  strokeWidth={(selected ? 2 : 1) / view.scale}
                  draggable={canvasMode.kind === "tool" && canvasMode.tool === "Select"}
                  onClick={(e) => {
                    if (canvasMode.kind !== "tool") return;
                    e.cancelBubble = true;
                    onSelectInstance?.(inst.id);
                  }}
                  onTap={(e) => {
                    if (canvasMode.kind !== "tool") return;
                    e.cancelBubble = true;
                    onSelectInstance?.(inst.id);
                  }}
                  onDragEnd={(e) => {
                    onMoveInstance?.(inst.id, e.target.x(), e.target.y());
                  }}
                />
              );
            })}

            {measurements.map((mark) => {
              const selected = mark.id === selectedId;
              const last = mark.points[mark.points.length - 1];
              const first = mark.points[0];
              const label = canvasMeasureLabel(mark.points, scale, measureUnit);
              const mid = first && last
                ? { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 }
                : null;
              return (
                <Group key={mark.id}>
                  <Line
                    name="measure-mark"
                    points={mark.points.flatMap((p) => [p.x, p.y])}
                    stroke={palette.text}
                    strokeWidth={(selected ? 2.5 : 1.5) / view.scale}
                    hitStrokeWidth={16 / view.scale}
                    lineCap="round"
                    lineJoin="round"
                    onClick={(e) => {
                      if (canvasMode.kind !== "tool") return;
                      e.cancelBubble = true;
                      onSelectInstance?.(mark.id);
                    }}
                    onTap={(e) => {
                      if (canvasMode.kind !== "tool") return;
                      e.cancelBubble = true;
                      onSelectInstance?.(mark.id);
                    }}
                  />
                  {mark.points.map((p, i) => (
                    <Circle
                      key={i}
                      x={p.x}
                      y={p.y}
                      radius={4 / view.scale}
                      fill={palette.text}
                      listening={false}
                    />
                  ))}
                  {mid && label ? (
                    <Text
                      x={mid.x}
                      y={mid.y - 16 / view.scale}
                      text={label}
                      fontSize={12.5 / view.scale}
                      fill={palette.text}
                      listening={false}
                    />
                  ) : null}
                </Group>
              );
            })}

            {measuring && measurePts.length >= 1 ? (
              <>
                {measurePts.map((p, i) => (
                  <Circle
                    key={`m${i}`}
                    x={p.x}
                    y={p.y}
                    radius={5 / view.scale}
                    fill={palette.selection}
                    listening={false}
                  />
                ))}
                {hover ? (
                  <>
                    <Line
                      points={[...measurePts, hover].flatMap((p) => [p.x, p.y])}
                      stroke={palette.selection}
                      strokeWidth={2 / view.scale}
                      listening={false}
                    />
                    {(() => {
                      const live = [...measurePts, hover];
                      const label = canvasMeasureLabel(live, scale, measureUnit);
                      const a = live[0]!;
                      const b = live[live.length - 1]!;
                      return label ? (
                        <Text
                          x={(a.x + b.x) / 2}
                          y={(a.y + b.y) / 2 - 16 / view.scale}
                          text={label}
                          fontSize={12.5 / view.scale}
                          fill={palette.selection}
                          listening={false}
                        />
                      ) : null;
                    })()}
                  </>
                ) : null}
              </>
            ) : null}
          </Layer>

          {/* Screen-space scale bar — ink/text, not selection blue (QA-08). */}
          {mapState === "calibrated" && barRealM != null && barScreenPx > 8 && palette ? (
            <Layer listening={false}>
              <Line
                points={[16, size.height - 28, 16 + barScreenPx, size.height - 28]}
                stroke={palette.text}
                strokeWidth={2}
              />
              <Line
                points={[16, size.height - 32, 16, size.height - 24]}
                stroke={palette.text}
                strokeWidth={2}
              />
              <Line
                points={[16 + barScreenPx, size.height - 32, 16 + barScreenPx, size.height - 24]}
                stroke={palette.text}
                strokeWidth={2}
              />
              <Text
                x={16}
                y={size.height - 48}
                text={`${barRealM} m`}
                fontSize={12}
                fill={palette.text}
              />
            </Layer>
          ) : null}
        </Stage>
      ) : null}

      {mapState === "no_map" && !placing && instances.length === 0 ? (
        <div className="canvas__empty">
          <p className="canvas__empty-title">No venue plan yet</p>
          <p className="canvas__empty-body">
            Optional for count-only quotes. Upload a plan when you need areas or
            lengths — then set its scale by clicking two known points.
          </p>
          {uploadHint ? <p className="canvas__empty-body" role="alert">{uploadHint}</p> : null}
          <div className="canvas__empty-actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={uploadBusy}
              onClick={onUploadClick}
            >
              {uploadBusy ? "Uploading…" : "Upload venue plan"}
            </button>
          </div>
        </div>
      ) : null}

      {mapState !== "no_map" && imageLoading ? (
        <div className="canvas__loading" role="status" aria-live="polite">
          Loading venue plan…
        </div>
      ) : null}

      {mapState !== "no_map" && imageFailed ? (
        <div className="canvas__loading" role="alert">
          Could not load the venue plan image.
        </div>
      ) : null}

      {pageNote ? <p className="canvas__page-note">{pageNote}</p> : null}
    </div>
  );
}
