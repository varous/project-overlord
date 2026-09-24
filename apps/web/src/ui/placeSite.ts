/**
 * Site placement mode UI: click to place the stage origin, drag the +Y handle to set the heading.
 *
 * The Cesium specifics (ground picking, ENU conversion, handle position) live in
 * `../viewer/sitePicker.ts`; this module owns the DOM controls and the interaction lifecycle.
 *
 * The heading handle only appears after the first pick, and it needs a real drag: pressing on it
 * arms a drag, but the heading only changes once the pointer has moved more than 4 px. A press and
 * release on the handle without movement falls through and places the site at that point.
 */

import * as Cesium from 'cesium';

import type { SiteAnchor } from '@overlord/geo-core';

import { headingFromDrag, nudgeHeading, snapHeading } from '../site/placementMath.js';
import { enuFromAnchor, headingHandleCartesian, pickGroundGeodetic } from '../viewer/sitePicker.js';
import type { Notices } from './notices.js';

export interface SitePlacementOptions {
  viewer: Cesium.Viewer;
  notices: Notices;
  getAnchor: () => SiteAnchor;
  isGoogleActive: () => boolean;
  onStart?: () => void;
  onPick: (latDeg: number, lonDeg: number) => void | Promise<void>;
  onHeading: (headingDeg: number) => void;
  onCancel: () => void;
}

export interface SitePlacementController {
  isActive(): boolean;
  start(): void;
  stop(): void;
  /** Hide and disable placement entirely (e.g. shared read-only view). */
  setDisabled(disabled: boolean): void;
  /** Re-sync the controls and handle after the anchor changed. */
  refresh(): void;
}

const NUDGES: Array<[string, number]> = [
  ['\u22125\u00b0', -5],
  ['\u22121\u00b0', -1],
  ['+1\u00b0', 1],
  ['+5\u00b0', 5],
];

/** Pointer movement (px) required before a press on the handle becomes a heading drag. */
const DRAG_THRESHOLD_PX = 4;

export function createSitePlacement(options: SitePlacementOptions): SitePlacementController {
  const { viewer, notices } = options;

  let active = false;
  let dragging = false;
  let armed = false;
  let armPosition: Cesium.Cartesian2 | null = null;
  let shiftDown = false;
  let handle: Cesium.Entity | null = null;
  let savedEnableInputs = true;

  const tools = document.createElement('div');
  tools.className = 'site-tools';
  const toggleButton = document.createElement('button');
  toggleButton.type = 'button';
  toggleButton.textContent = 'Place site';
  toggleButton.addEventListener('click', () => {
    if (active) {
      stop();
    } else {
      start();
    }
  });
  tools.appendChild(toggleButton);

  const controls = document.createElement('div');
  controls.className = 'place-controls';
  controls.hidden = true;

  for (const [label, delta] of NUDGES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      options.onHeading(nudgeHeading(options.getAnchor().headingDeg, delta));
    });
    controls.appendChild(button);
  }

  const headingInput = document.createElement('input');
  headingInput.type = 'text';
  headingInput.inputMode = 'decimal';
  headingInput.className = 'place-controls__input';
  headingInput.setAttribute('aria-label', 'Heading degrees');
  headingInput.addEventListener('change', () => {
    const value = Number(headingInput.value);
    if (Number.isFinite(value)) {
      options.onHeading(value);
    }
    syncInput();
  });
  controls.appendChild(headingInput);

  const doneButton = document.createElement('button');
  doneButton.type = 'button';
  doneButton.textContent = 'Done';
  doneButton.addEventListener('click', () => {
    stop();
  });
  controls.appendChild(doneButton);

  const hint = document.createElement('span');
  hint.className = 'place-controls__hint';
  hint.textContent = 'Drag the +Y handle (Shift snaps to 5\u00b0) or type a heading';
  controls.appendChild(hint);

  document.body.append(tools, controls);

  function syncInput(): void {
    headingInput.value = options.getAnchor().headingDeg.toFixed(2);
  }

  function updateHandle(): void {
    if (handle === null) {
      return;
    }
    handle.position = new Cesium.ConstantPositionProperty(headingHandleCartesian(options.getAnchor()));
  }

  function ensureHandle(): void {
    if (handle !== null) {
      return;
    }
    handle = viewer.entities.add({
      id: 'placement-handle',
      name: 'Audience heading (+Y)',
      position: headingHandleCartesian(options.getAnchor()),
      point: {
        pixelSize: 16,
        color: Cesium.Color.CYAN,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: '+Y',
        font: '14px sans-serif',
        fillColor: Cesium.Color.CYAN,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -16),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }

  function removeHandle(): void {
    if (handle !== null) {
      viewer.entities.remove(handle);
      handle = null;
    }
  }

  /** Place the site at a screen position. Returns true when a ground point was picked. */
  function placeAt(position: Cesium.Cartesian2): boolean {
    const point = pickGroundGeodetic(viewer, position, options.isGoogleActive());
    if (point === null) {
      return false;
    }
    void options.onPick(point.latDeg, point.lonDeg);
    ensureHandle();
    updateHandle();
    syncInput();
    return true;
  }

  function startDragging(): void {
    dragging = true;
    savedEnableInputs = viewer.scene.screenSpaceCameraController.enableInputs;
    viewer.scene.screenSpaceCameraController.enableInputs = false;
  }

  function endDragging(): void {
    if (dragging) {
      dragging = false;
      viewer.scene.screenSpaceCameraController.enableInputs = savedEnableInputs;
    }
    armed = false;
    armPosition = null;
  }

  function distancePx(a: Cesium.Cartesian2, b: Cesium.Cartesian2): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    if (!active) {
      return;
    }
    const picked = viewer.scene.pick(event.position);
    if (handle !== null && picked !== undefined && picked !== null && picked.id === handle) {
      // Arm a potential drag; the heading only changes once the pointer has moved.
      armed = true;
      armPosition = Cesium.Cartesian2.clone(event.position);
      return;
    }
    placeAt(event.position);
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

  handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
    if (!active) {
      return;
    }
    if (armed && !dragging) {
      if (armPosition === null || distancePx(event.endPosition, armPosition) <= DRAG_THRESHOLD_PX) {
        return;
      }
      startDragging();
    }
    if (!dragging) {
      return;
    }
    const point = pickGroundGeodetic(viewer, event.endPosition, options.isGoogleActive());
    if (point === null) {
      return;
    }
    const enu = enuFromAnchor(options.getAnchor(), point);
    let heading = headingFromDrag({ east: 0, north: 0 }, enu);
    if (shiftDown) {
      heading = snapHeading(heading, 5);
    }
    options.onHeading(heading);
    updateHandle();
    syncInput();
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  handler.setInputAction(() => {
    if (!active) {
      return;
    }
    if (dragging) {
      endDragging();
      return;
    }
    if (armed && armPosition !== null) {
      // A press on the handle without movement falls through and places the site there.
      const position = armPosition;
      endDragging();
      placeAt(position);
    }
  }, Cesium.ScreenSpaceEventType.LEFT_UP);

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Shift') {
      shiftDown = true;
    }
    if (active && event.key === 'Escape') {
      cancel();
    }
  }

  function onKeyUp(event: KeyboardEvent): void {
    if (event.key === 'Shift') {
      shiftDown = false;
    }
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  function cancel(): void {
    options.onCancel();
    stop();
  }

  function start(): void {
    if (active) {
      return;
    }
    active = true;
    toggleButton.classList.add('active');
    toggleButton.textContent = 'Placing\u2026';
    controls.hidden = false;
    document.body.classList.add('placing');
    options.onStart?.();
    notices.showBanner(
      'place-hint',
      'Click the ground where the downstage-centre edge of the main stage should be',
      { tone: 'info' },
    );
    syncInput();
  }

  function stop(): void {
    if (!active) {
      return;
    }
    active = false;
    endDragging();
    viewer.scene.screenSpaceCameraController.enableInputs = savedEnableInputs;
    toggleButton.classList.remove('active');
    toggleButton.textContent = 'Place site';
    controls.hidden = true;
    document.body.classList.remove('placing');
    notices.clearBanner('place-hint');
    removeHandle();
  }

  return {
    isActive: () => active,
    start,
    stop,
    setDisabled: (disabled: boolean) => {
      if (disabled) {
        stop();
      }
      tools.hidden = disabled;
      toggleButton.disabled = disabled;
    },
    refresh: () => {
      syncInput();
      if (active) {
        updateHandle();
      }
    },
  };
}
