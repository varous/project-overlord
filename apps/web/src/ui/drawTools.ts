/**
 * Draw and edit shapes on the ground: rectangle zones, polygon zones, measurements, and zone
 * vertex/midpoint handles. All geometry goes through @overlord/commands primitives; every edit is
 * issued as ONE command on release so undo steps stay meaningful.
 */

import * as Cesium from 'cesium';

import { geodeticToLocal, localToGeodetic, type LocalPoint, type SiteAnchor, type Tmm } from '@overlord/geo-core';
import { polygonRing, rectRing, SNAP_FINE_1FT, SNAP_MODULE_10FT, snapLengthTmm } from '@overlord/commands';
import {
  pathLengthFt,
  pathLengthTmm,
  segmentCount,
  zoneAreaSqFt,
  zoneCapacity,
  type LinearElement,
  type Ring2,
  type SceneMeasurement,
  type SceneZone,
} from '@overlord/scene';

import { pickGroundGeodetic } from '../viewer/sitePicker.js';
import type { Notices } from './notices.js';

export type DrawMode = 'rectangle' | 'polygon' | 'measure' | 'linear';

export interface DrawToolsOptions {
  viewer: Cesium.Viewer;
  notices: Notices;
  getAnchor: () => SiteAnchor;
  isEnabled: () => boolean;
  getSelectedZone: () => SceneZone | null;
  onRingDrawn: (ring: Ring2, tool: 'rectangle' | 'polygon') => void;
  onMeasurement: (measurement: Omit<SceneMeasurement, 'id'>) => void;
  onZoneRing: (zoneId: string, ring: Ring2) => void;
  onLinearRun: (typeCode: string, path: Ring2, widthTmm: number | null) => void;
  onLinearPath: (id: string, path: Ring2) => void;
  getSelectedLinear: () => LinearElement | null;
  linearSpec: (typeCode: string) => { segmentLength: number; defaultWidth: number; unit: 'RFT' | 'RM' } | null;
  onError: (message: string) => void;
}

export interface DrawTools {
  start(mode: DrawMode): void;
  startLinear(typeCode: string, widthTmm: number | null): void;
  finish(): void;
  cancel(): void;
  isDrawing(): boolean;
  mode(): DrawMode | null;
  refresh(): void;
}

const PREVIEW_ID = 'draw-preview';
const HANDLE_PREFIX = 'zone-handle-';
const MIDPOINT_PREFIX = 'zone-midpoint-';
const LINEAR_HANDLE_PREFIX = 'linear-handle-';
const LINEAR_MIDPOINT_PREFIX = 'linear-midpoint-';

function formatSqFt(value: number): string {
  return `${Math.round(value).toLocaleString('en-US')} sq ft`;
}

function formatFeet(value: number): string {
  return `${(value / 3048).toFixed(1)} ft`;
}

export function createDrawTools(options: DrawToolsOptions): DrawTools {
  const { viewer } = options;

  let mode: DrawMode | null = null;
  let linearTypeCode: string | null = null;
  let linearWidthTmm: number | null = null;
  let vertices: LocalPoint[] = [];
  let rectStart: LocalPoint | null = null;
  let rectCurrent: LocalPoint | null = null;
  let altDown = false;

  // Zone vertex editing state.
  let handleDrag: { zoneId: string; vertexIndex: number; insert: boolean } | null = null;
  let handlePreviewRing: Ring2 | null = null;
  let linearHandleDrag: { id: string; vertexIndex: number } | null = null;

  const chip = document.createElement('div');
  chip.className = 'draw-chip';
  chip.hidden = true;
  document.body.appendChild(chip);

  function setChip(text: string | null): void {
    if (text === null) {
      chip.hidden = true;
      chip.textContent = '';
    } else {
      chip.hidden = false;
      chip.textContent = text;
    }
  }

  function module(): Tmm {
    return altDown ? SNAP_FINE_1FT : SNAP_MODULE_10FT;
  }

  function localFromScreen(screen: Cesium.Cartesian2): LocalPoint | null {
    const ground = pickGroundGeodetic(viewer, screen, false);
    if (ground === null) {
      return null;
    }
    return geodeticToLocal(options.getAnchor(), ground);
  }

  function snap(point: LocalPoint): LocalPoint {
    return {
      x: snapLengthTmm(point.x, module()),
      y: snapLengthTmm(point.y, module()),
      z: 0 as Tmm,
    };
  }

  function removePreview(): void {
    const existing = viewer.entities.getById(PREVIEW_ID);
    if (existing !== undefined) {
      viewer.entities.remove(existing);
    }
  }

  function showPreviewRing(ring: Ring2): void {
    removePreview();
    if (!viewer.scene.globe.show && ring.length < 3) {
      return;
    }
    const positions = ring.map((point) => {
      const geodetic = localToGeodetic(options.getAnchor(), { x: point.x, y: point.y, z: 0 as Tmm });
      return Cesium.Cartesian3.fromDegrees(geodetic.lonDeg, geodetic.latDeg, geodetic.heightM);
    });
    if (positions.length < 3) {
      return;
    }
    viewer.entities.add({
      id: PREVIEW_ID,
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(positions),
        material: Cesium.Color.fromCssColorString('#22d3ee').withAlpha(0.25),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#22d3ee'),
        perPositionHeight: true,
      },
    });
  }

  function removeZoneHandles(): void {
    for (const entity of [...viewer.entities.values]) {
      const id = String(entity.id);
      if (
        id.startsWith(HANDLE_PREFIX) ||
        id.startsWith(MIDPOINT_PREFIX) ||
        id.startsWith(LINEAR_HANDLE_PREFIX) ||
        id.startsWith(LINEAR_MIDPOINT_PREFIX)
      ) {
        viewer.entities.remove(entity);
      }
    }
  }

  function handlePosition(point: { x: number; y: number }): Cesium.Cartesian3 {
    const geodetic = localToGeodetic(options.getAnchor(), {
      x: point.x as Tmm,
      y: point.y as Tmm,
      z: 0 as Tmm,
    });
    return Cesium.Cartesian3.fromDegrees(geodetic.lonDeg, geodetic.latDeg, geodetic.heightM);
  }

  function refresh(): void {
    removeZoneHandles();
    if (mode !== null || !options.isEnabled()) {
      return;
    }
    const linear = options.getSelectedLinear();
    if (linear !== null) {
      const ring = handlePreviewRing ?? linear.path.value;
      ring.forEach((point, index) => {
        viewer.entities.add({
          id: `${LINEAR_HANDLE_PREFIX}${index}`,
          position: handlePosition(point),
          point: {
            pixelSize: 12,
            color: Cesium.Color.fromCssColorString('#f97316'),
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        const next = ring[index + 1];
        if (next === undefined) {
          return;
        }
        viewer.entities.add({
          id: `${LINEAR_MIDPOINT_PREFIX}${index}`,
          position: handlePosition({ x: Math.round((point.x + next.x) / 2), y: Math.round((point.y + next.y) / 2) }),
          point: {
            pixelSize: 8,
            color: Cesium.Color.WHITE.withAlpha(0.7),
            outlineColor: Cesium.Color.fromCssColorString('#c2410c'),
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
      });
      chip.style.left = '50%';
      chip.style.top = '150px';
      chip.style.transform = 'translateX(-50%)';
      setChip(linearReadout(ring, linear.typeCode));
      return;
    }
    const zone = options.getSelectedZone();
    if (zone === null) {
      return;
    }
    const ring = handlePreviewRing ?? zone.ring.value;
    ring.forEach((point, index) => {
      viewer.entities.add({
        id: `${HANDLE_PREFIX}${index}`,
        position: handlePosition(point),
        point: {
          pixelSize: 12,
          color: Cesium.Color.fromCssColorString('#22d3ee'),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      const next = ring[(index + 1) % ring.length];
      if (next === undefined) {
        return;
      }
      const midpoint = { x: Math.round((point.x + next.x) / 2), y: Math.round((point.y + next.y) / 2) };
      viewer.entities.add({
        id: `${MIDPOINT_PREFIX}${index}`,
        position: handlePosition(midpoint),
        point: {
          pixelSize: 8,
          color: Cesium.Color.WHITE.withAlpha(0.7),
          outlineColor: Cesium.Color.fromCssColorString('#0e7490'),
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    });

    // Live readout chip while the zone is selected. Dragging re-anchors it to the cursor.
    chip.style.left = '50%';
    chip.style.top = '150px';
    chip.style.transform = 'translateX(-50%)';
    setChip(zoneReadout(ring));
  }

  function zoneReadout(ring: Ring2): string {
    const zone = options.getSelectedZone();
    const density = zone?.densitySqFtPerPerson.value ?? 5;
    const area = zoneAreaSqFt(ring);
    const pax = zoneCapacity(ring, density);
    return `${formatSqFt(area)} · ${pax.toLocaleString('en-US')} pax @ ${density} sq ft/person`;
  }

  function linearReadout(path: Ring2, typeCode: string | null): string {
    const spec = typeCode === null ? null : options.linearSpec(typeCode);
    const lengthFt = pathLengthFt(path);
    const lengthM = pathLengthTmm(path) / 10000;
    const segment = spec?.segmentLength ?? 0;
    const segments = segment > 0 ? segmentCount(path, segment as never) : 0;
    const segmentLabel =
      segment > 0 ? ` \u00b7 ${segments} segments @ ${(segment / 10000).toFixed(2)} m` : '';
    return `${Math.round(lengthFt).toLocaleString('en-US')} ft \u00b7 ${lengthM.toFixed(0)} m${segmentLabel}`;
  }

  function setMode(next: DrawMode | null): void {
    mode = next;
    if (next !== 'linear') {
      linearTypeCode = null;
      linearWidthTmm = null;
    }
    vertices = [];
    rectStart = null;
    rectCurrent = null;
    handlePreviewRing = null;
    removePreview();
    removeZoneHandles();
    document.body.classList.toggle('drawing', next !== null);
    if (next !== null) {
      options.notices.showBanner(
        'draw-hint',
        next === 'rectangle'
          ? 'Drag on the ground to draw a rectangle zone (Alt for 1 ft) — Escape cancels'
          : next === 'polygon'
            ? 'Click to add vertices; Enter or click the first vertex closes — Backspace removes the last — Escape cancels'
            : next === 'linear'
              ? 'Click points to draw the run; Enter or double-click ends it — Escape cancels'
              : 'Click points to measure; Enter finishes — Escape cancels',
        { tone: 'info' },
      );
    } else {
      options.notices.clearBanner('draw-hint');
      setChip(null);
    }
  }

  function pickedId(position: Cesium.Cartesian2): string | null {
    const picked = viewer.scene.pick(position);
    if (picked === undefined || picked === null) {
      return null;
    }
    const entity = (picked as { id?: unknown }).id;
    if (entity !== undefined && entity !== null && typeof (entity as { id?: unknown }).id === 'string') {
      return (entity as { id: string }).id;
    }
    return null;
  }

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    if (!options.isEnabled()) {
      return;
    }

    // Zone handles take precedence when no draw mode is active.
    if (mode === null) {
      const id = pickedId(event.position);
      const zone = options.getSelectedZone();
      if (id !== null && zone !== null) {
        if (id.startsWith(HANDLE_PREFIX)) {
          const index = Number(id.slice(HANDLE_PREFIX.length));
          if (altDown) {
            if (zone.ring.value.length <= 3) {
              options.onError('A zone needs at least 3 vertices.');
              return;
            }
            const ring = zone.ring.value.filter((_, i) => i !== index);
            options.onZoneRing(zone.id, ring);
            return;
          }
          handleDrag = { zoneId: zone.id, vertexIndex: index, insert: false };
          handlePreviewRing = zone.ring.value.map((point) => ({ ...point }));
          return;
        }
        if (id.startsWith(MIDPOINT_PREFIX)) {
          const index = Number(id.slice(MIDPOINT_PREFIX.length));
          const ring = zone.ring.value.map((point) => ({ ...point }));
          const next = ring[(index + 1) % ring.length];
          const current = ring[index];
          if (current === undefined || next === undefined) {
            return;
          }
          ring.splice(index + 1, 0, {
            x: Math.round((current.x + next.x) / 2) as Tmm,
            y: Math.round((current.y + next.y) / 2) as Tmm,
          });
          handleDrag = { zoneId: zone.id, vertexIndex: index + 1, insert: true };
          handlePreviewRing = ring;
          return;
        }
      }
      return;
    }

    const local = localFromScreen(event.position);
    if (local === null) {
      return;
    }
    const snapped = snap(local);
    if (mode === 'rectangle') {
      rectStart = snapped;
      rectCurrent = snapped;
    } else {
      vertices.push(snapped);
      if (mode === 'polygon') {
        if (vertices.length >= 3) {
          setChip(zoneReadout(vertices.map((point) => ({ x: point.x, y: point.y }))));
        }
      }
    }
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

  handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
    if (!options.isEnabled()) {
      return;
    }
    if (linearHandleDrag !== null && handlePreviewRing !== null) {
      const drag = linearHandleDrag;
      const ring = handlePreviewRing;
      linearHandleDrag = null;
      handlePreviewRing = null;
      removePreview();
      setChip(null);
      options.onLinearPath(drag.id, ring);
      return;
    }
    if (handleDrag !== null && handlePreviewRing !== null) {
      const local = localFromScreen(event.endPosition);
      if (local === null) {
        return;
      }
      const snapped = snap(local);
      const ring = handlePreviewRing.map((point) => ({ ...point }));
      ring[handleDrag.vertexIndex] = snapped;
      handlePreviewRing = ring;
      showPreviewRing(ring);
      const zone = options.getSelectedZone();
      if (zone !== null) {
        chip.style.transform = 'none';
        chip.style.left = `${event.endPosition.x + 14}px`;
        chip.style.top = `${event.endPosition.y + 14}px`;
        setChip(zoneReadout(ring));
      }
      return;
    }
    if (mode === null) {
      return;
    }
    const local = localFromScreen(event.endPosition);
    if (local === null) {
      return;
    }
    const snapped = snap(local);
    chip.style.transform = 'none';
    chip.style.left = `${event.endPosition.x + 14}px`;
    chip.style.top = `${event.endPosition.y + 14}px`;
    if (mode === 'rectangle' && rectStart !== null) {
      rectCurrent = snapped;
      const sizeX = Math.abs(snapped.x - rectStart.x);
      const sizeY = Math.abs(snapped.y - rectStart.y);
      const centre = {
        x: Math.round((rectStart.x + snapped.x) / 2) as Tmm,
        y: Math.round((rectStart.y + snapped.y) / 2) as Tmm,
        z: 0 as Tmm,
      };
      const ring = rectRing(centre, sizeX as Tmm, sizeY as Tmm, 0);
      showPreviewRing(ring);
      setChip(`${formatFeet(sizeX)} × ${formatFeet(sizeY)} · ${formatSqFt(zoneAreaSqFt(ring))}`);
    } else if (mode === 'polygon' && vertices.length > 0) {
      const preview = [...vertices, snapped];
      if (preview.length >= 3) {
        showPreviewRing(preview.map((point) => ({ x: point.x, y: point.y })) as Ring2);
      }
    } else if (mode === 'linear' && vertices.length > 0) {
      setChip(linearReadout(vertices.map((point) => ({ x: point.x, y: point.y })) as Ring2, linearTypeCode));
    } else if (mode === 'measure' && vertices.length > 0) {
      const preview = [...vertices, snapped];
      showPreviewRing(preview.map((point) => ({ x: point.x, y: point.y })) as Ring2);
      if (preview.length === 2) {
        const a = preview[0];
        const b = preview[1];
        if (a !== undefined && b !== undefined) {
          const distance = Math.hypot(b.x - a.x, b.y - a.y) / 3048;
          setChip(`${distance.toFixed(1)} ft`);
        }
      }
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  handler.setInputAction(() => {
    if (!options.isEnabled()) {
      return;
    }
    if (linearHandleDrag !== null && handlePreviewRing !== null) {
      const drag = linearHandleDrag;
      const ring = handlePreviewRing;
      linearHandleDrag = null;
      handlePreviewRing = null;
      removePreview();
      setChip(null);
      options.onLinearPath(drag.id, ring);
      return;
    }
    if (handleDrag !== null && handlePreviewRing !== null) {
      const drag = handleDrag;
      const ring = handlePreviewRing;
      handleDrag = null;
      handlePreviewRing = null;
      removePreview();
      setChip(null);
      options.onZoneRing(drag.zoneId, ring);
      return;
    }
    if (mode === 'rectangle' && rectStart !== null && rectCurrent !== null) {
      const start = rectStart;
      const end = rectCurrent;
      setMode(null);
      const centre = {
        x: Math.round((start.x + end.x) / 2) as Tmm,
        y: Math.round((start.y + end.y) / 2) as Tmm,
        z: 0 as Tmm,
      };
      const ring = rectRing(
        centre,
        Math.abs(end.x - start.x) as Tmm,
        Math.abs(end.y - start.y) as Tmm,
        0,
      );
      if (Math.abs(end.x - start.x) < 1000 || Math.abs(end.y - start.y) < 1000) {
        options.onError('That rectangle is too small — drag a bigger area.');
        return;
      }
      options.onRingDrawn(ring, 'rectangle');
    }
  }, Cesium.ScreenSpaceEventType.LEFT_UP);

  function finish(): void {
    if (mode === 'linear' && vertices.length >= 2) {
      const code = linearTypeCode;
      const path = vertices.map((point) => ({ x: point.x, y: point.y })) as Ring2;
      const width = linearWidthTmm;
      setMode(null);
      if (code !== null) {
        options.onLinearRun(code, path, width);
      }
      return;
    }
    if (mode === 'polygon' && vertices.length >= 3) {
      const points = vertices.map((point) => ({ x: point.x, y: point.y }));
      let ring: Ring2;
      try {
        ring = polygonRing(points);
      } catch (error) {
        options.onError(error instanceof Error ? error.message : 'That polygon is not valid.');
        return;
      }
      setMode(null);
      options.onRingDrawn(ring, 'polygon');
      return;
    }
    if (mode === 'measure' && vertices.length >= 2) {
      const points = vertices.map((point) => ({ ...point }));
      const kind = points.length >= 3 ? 'AREA' : 'DISTANCE';
      setMode(null);
      options.onMeasurement({
        label: kind === 'AREA' ? 'Area measurement' : 'Distance measurement',
        kind,
        points,
      });
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Alt') {
      altDown = true;
    }
    if (event.key === 'Backspace' && mode === 'polygon' && vertices.length > 0) {
      event.preventDefault();
      vertices.pop();
      setChip(
        vertices.length >= 3 ? zoneReadout(vertices.map((point) => ({ x: point.x, y: point.y }))) : null,
      );
    }
  }
  function onKeyUp(event: KeyboardEvent): void {
    if (event.key === 'Alt') {
      altDown = false;
    }
  }
  handler.setInputAction(() => {
    if (options.isEnabled() && (mode === 'linear' || mode === 'polygon' || mode === 'measure')) {
      finish();
    }
  }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  return {
    start: (next) => setMode(next),
    startLinear: (typeCode, widthTmm) => {
      setMode('linear');
      linearTypeCode = typeCode;
      linearWidthTmm = widthTmm;
    },
    finish,
    cancel: () => setMode(null),
    isDrawing: () => mode !== null,
    mode: () => mode,
    refresh,
  };
}
