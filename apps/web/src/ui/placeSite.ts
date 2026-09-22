/**
 * Site placement mode UI: click to place the stage origin, drag the +Y handle to set the heading.
 *
 * The Cesium specifics (ground picking, ENU conversion, handle position) live in
 * `../viewer/sitePicker.ts`; this module owns the DOM controls and the interaction lifecycle.
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
  /** Re-sync the controls and handle after the anchor changed. */
  refresh(): void;
}

const NUDGES: Array<[string, number]> = [
  ['\u22125\u00b0', -5],
  ['\u22121\u00b0', -1],
  ['+1\u00b0', 1],
  ['+5\u00b0', 5],
];

export function createSitePlacement(options: SitePlacementOptions): SitePlacementController {
  const { viewer, notices } = options;

  let active = false;
  let dragging = false;
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

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    if (!active) {
      return;
    }
    const picked = viewer.scene.pick(event.position);
    if (handle !== null && picked !== undefined && picked !== null && picked.id === handle) {
      dragging = true;
      savedEnableInputs = viewer.scene.screenSpaceCameraController.enableInputs;
      viewer.scene.screenSpaceCameraController.enableInputs = false;
      return;
    }
    const point = pickGroundGeodetic(viewer, event.position, options.isGoogleActive());
    if (point === null) {
      return;
    }
    void options.onPick(point.latDeg, point.lonDeg);
    ensureHandle();
    updateHandle();
    syncInput();
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

  handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
    if (!active || !dragging) {
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
      dragging = false;
      viewer.scene.screenSpaceCameraController.enableInputs = savedEnableInputs;
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
    options.onStart?.();
    notices.showBanner(
      'place-hint',
      'Click the ground where the downstage-centre edge of the main stage should be',
      { tone: 'info' },
    );
    ensureHandle();
    syncInput();
  }

  function stop(): void {
    if (!active) {
      return;
    }
    active = false;
    dragging = false;
    viewer.scene.screenSpaceCameraController.enableInputs = savedEnableInputs;
    toggleButton.classList.remove('active');
    toggleButton.textContent = 'Place site';
    controls.hidden = true;
    notices.clearBanner('place-hint');
    removeHandle();
  }

  return {
    isActive: () => active,
    start,
    stop,
    refresh: () => {
      syncInput();
      if (active) {
        updateHandle();
      }
    },
  };
}
