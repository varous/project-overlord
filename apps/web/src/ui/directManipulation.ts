/**
 * Direct manipulation of the selected element: drag on the ground plane to move, drag the ⟳ handle
 * to rotate. Uses a preview transform while dragging and issues exactly ONE command on release, so
 * undo steps stay meaningful. Camera controls are suspended during a drag and restored afterwards.
 */

import * as Cesium from 'cesium';

import {
  localToEcefMatrix,
  localToGeodetic,
  geodeticToLocal,
  type LocalPoint,
  type Mat4,
  type SiteAnchor,
  type Tmm,
} from '@overlord/geo-core';
import {
  SNAP_FINE_1FT,
  SNAP_MODULE_10FT,
  snapAngleDeg,
  snapLengthTmm,
  type Command,
} from '@overlord/commands';
import type { PlacedElement } from '@overlord/scene';

import { pickGroundGeodetic } from '../viewer/sitePicker.js';

export type Selection = { kind: 'element' | 'zone'; id: string };

export interface DirectManipulationOptions {
  viewer: Cesium.Viewer;
  getAnchor: () => SiteAnchor;
  getSelection: () => Selection | null;
  getElement: (id: string) => PlacedElement | null;
  onCommand: (command: Command) => { ok: boolean };
  isEnabled: () => boolean;
}

export interface DirectManipulation {
  refresh(): void;
}

const HANDLE_ID = 'rotate-handle';
const HANDLE_OFFSET_TMM = 30000; // 3 m beyond the element edge

export function pickedEntityId(picked: unknown): string | null {
  if (picked === undefined || picked === null) {
    return null;
  }
  const entity = (picked as { id?: unknown }).id;
  if (entity !== undefined && entity !== null && typeof (entity as { id?: unknown }).id === 'string') {
    return (entity as { id: string }).id;
  }
  return null;
}

function matrix3FromMat4(m: Mat4): Cesium.Matrix3 {
  return Cesium.Matrix3.fromColumnMajorArray([m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]);
}

export function createDirectManipulation(options: DirectManipulationOptions): DirectManipulation {
  const { viewer } = options;

  let mode: 'move' | 'rotate' | null = null;
  let activeId: string | null = null;
  let startLocal: LocalPoint | null = null;
  let pendingCenter: LocalPoint | null = null;
  let pendingRotation = 0;
  let savedEnableInputs = true;
  let altDown = false;
  let shiftDown = false;
  let handle: Cesium.Entity | null = null;

  const readout = document.createElement('div');
  readout.className = 'drag-readout';
  readout.hidden = true;
  document.body.appendChild(readout);

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

  function entityById(id: string): Cesium.Entity | undefined {
    return viewer.entities.getById(id);
  }

  function previewCenter(id: string, center: LocalPoint): void {
    const entity = entityById(id);
    if (entity === undefined) {
      return;
    }
    const geodetic = localToGeodetic(options.getAnchor(), center);
    entity.position = new Cesium.ConstantPositionProperty(
      Cesium.Cartesian3.fromDegrees(geodetic.lonDeg, geodetic.latDeg, geodetic.heightM),
    );
  }

  function previewRotation(id: string, rotationDeg: number): void {
    const entity = entityById(id);
    if (entity === undefined) {
      return;
    }
    const base = matrix3FromMat4(localToEcefMatrix(options.getAnchor()));
    const elementRotation = Cesium.Matrix3.fromRotationZ(-Cesium.Math.toRadians(rotationDeg));
    const orientation = Cesium.Matrix3.multiply(base, elementRotation, new Cesium.Matrix3());
    entity.orientation = new Cesium.ConstantProperty(Cesium.Quaternion.fromRotationMatrix(orientation));
  }

  function removeHandle(): void {
    if (handle !== null) {
      viewer.entities.remove(handle);
      handle = null;
    }
  }

  function handlePosition(element: PlacedElement): Cesium.Cartesian3 {
    const center = element.placement.value.center;
    const radians = (element.placement.value.rotationDeg * Math.PI) / 180;
    const distance = element.size.value.x / 2 + HANDLE_OFFSET_TMM;
    const local = {
      x: Math.round(center.x + distance * Math.cos(radians)) as Tmm,
      y: Math.round(center.y - distance * Math.sin(radians)) as Tmm,
      z: 0 as Tmm,
    };
    const geodetic = localToGeodetic(options.getAnchor(), local);
    return Cesium.Cartesian3.fromDegrees(geodetic.lonDeg, geodetic.latDeg, geodetic.heightM);
  }

  function refresh(): void {
    const selection = options.getSelection();
    if (!options.isEnabled() || selection === null || selection.kind !== 'element') {
      removeHandle();
      return;
    }
    const element = options.getElement(selection.id);
    if (element === null) {
      removeHandle();
      return;
    }
    const position = handlePosition(element);
    if (handle === null) {
      handle = viewer.entities.add({
        id: HANDLE_ID,
        name: 'Rotate',
        position,
        point: {
          pixelSize: 14,
          color: Cesium.Color.fromCssColorString('#22d3ee'),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: '\u27f3',
          font: '16px sans-serif',
          fillColor: Cesium.Color.fromCssColorString('#22d3ee'),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -16),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    } else {
      handle.position = new Cesium.ConstantPositionProperty(position);
    }
  }

  function numberFt(value: number): string {
    const feet = value / 3048;
    return `${feet.toFixed(1)} ft`;
  }

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    if (!options.isEnabled() || mode !== null) {
      return;
    }
    const selection = options.getSelection();
    if (selection === null || selection.kind !== 'element') {
      return;
    }
    const pickedId = pickedEntityId(viewer.scene.pick(event.position));
    const rotating = pickedId === HANDLE_ID;
    if (!rotating && pickedId !== selection.id) {
      return;
    }
    const start = localFromScreen(event.position);
    const element = options.getElement(selection.id);
    if (start === null || element === null) {
      return;
    }
    mode = rotating ? 'rotate' : 'move';
    activeId = selection.id;
    startLocal = start;
    pendingCenter = element.placement.value.center;
    pendingRotation = element.placement.value.rotationDeg;
    savedEnableInputs = viewer.scene.screenSpaceCameraController.enableInputs;
    viewer.scene.screenSpaceCameraController.enableInputs = false;
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

  handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
    if (mode === null || activeId === null || startLocal === null) {
      return;
    }
    const current = localFromScreen(event.endPosition);
    if (current === null) {
      return;
    }
    const element = options.getElement(activeId);
    if (element === null) {
      return;
    }

    if (mode === 'move') {
      let dx = current.x - startLocal.x;
      let dy = current.y - startLocal.y;
      dx = snapLengthTmm(dx as never, module());
      dy = snapLengthTmm(dy as never, module());
      if (shiftDown) {
        if (Math.abs(dx) >= Math.abs(dy)) {
          dy = 0;
        } else {
          dx = 0;
        }
      }
      const start = element.placement.value.center;
      pendingCenter = { x: start.x + dx, y: start.y + dy, z: start.z } as unknown as LocalPoint;
      previewCenter(activeId, pendingCenter);
      readout.hidden = false;
      readout.textContent = `Δ ${numberFt(dx)} / ${numberFt(dy)}  (${altDown ? '1 ft' : '10 ft'}${shiftDown ? ', axis' : ''})`;
    } else {
      const center = element.placement.value.center;
      const angle = snapAngleDeg(
        (Math.atan2(current.x - center.x, current.y - center.y) * 180) / Math.PI,
        altDown ? 1 : 5,
      );
      pendingRotation = angle;
      previewRotation(activeId, angle);
      readout.hidden = false;
      readout.textContent = `Rotation ${angle.toFixed(0)}°  (${altDown ? '1°' : '5°'})`;
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  handler.setInputAction(() => {
    if (mode === null || activeId === null) {
      return;
    }
    const id = activeId;
    const finished = mode;
    const center = pendingCenter;
    const rotation = pendingRotation;
    mode = null;
    activeId = null;
    startLocal = null;
    pendingCenter = null;
    readout.hidden = true;
    viewer.scene.screenSpaceCameraController.enableInputs = savedEnableInputs;

    const element = options.getElement(id);
    if (element === null) {
      return;
    }
    if (finished === 'move' && center !== null) {
      const moved =
        center.x !== element.placement.value.center.x ||
        center.y !== element.placement.value.center.y ||
        center.z !== element.placement.value.center.z;
      if (moved) {
        options.onCommand({ type: 'MOVE_ELEMENT_ABSOLUTE', id, center });
      }
    } else if (finished === 'rotate' && rotation !== element.placement.value.rotationDeg) {
      options.onCommand({ type: 'ROTATE_ELEMENT', id, rotationDeg: rotation });
    }
  }, Cesium.ScreenSpaceEventType.LEFT_UP);

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Alt') {
      altDown = true;
    }
    if (event.key === 'Shift') {
      shiftDown = true;
    }
  }
  function onKeyUp(event: KeyboardEvent): void {
    if (event.key === 'Alt') {
      altDown = false;
    }
    if (event.key === 'Shift') {
      shiftDown = false;
    }
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  return { refresh };
}
