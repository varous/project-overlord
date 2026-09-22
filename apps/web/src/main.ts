import 'cesium/Build/Cesium/Widgets/widgets.css';

import * as Cesium from 'cesium';

import type { SiteAnchor } from '@overlord/geo-core';

import { DEMO_ANCHOR, DEMO_ELEMENTS } from './site/demoSite.js';
import { normalizeHeading, parseUrlState, serializeUrlState } from './site/urlState.js';
import { renderAxes } from './viewer/axes.js';
import { sampleGroundHeight } from './viewer/groundHeight.js';
import { createMapStacks, type MapStack, type MapStackChange } from './viewer/mapStacks.js';
import { renderElements } from './viewer/render.js';
import { createViewpointButtons, flyToViewpoint, type ViewpointName } from './viewer/viewpoints.js';
import { createDebugPanel } from './ui/debugPanel.js';
import { createNotices } from './ui/notices.js';
import { createSitePlacement } from './ui/placeSite.js';
import './style.css';

// Cesium ion, Bing and Cesium World Terrain are deliberately not used in this task.
Cesium.Ion.defaultAccessToken = '';

const container = document.getElementById('cesium-container');
if (container === null) {
  throw new Error('Missing #cesium-container');
}

const viewer = new Cesium.Viewer(container, {
  baseLayer: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  animation: false,
  timeline: false,
  fullscreenButton: false,
  infoBox: true,
  selectionIndicator: true,
  // Never show Cesium's blocking render-error panel; renderError recovery handles it instead.
  showRenderLoopErrors: false,
});

const notices = createNotices(document.body);
const googleKey = import.meta.env.VITE_GOOGLE_MAPS_KEY ?? '';
const arcgisKey = import.meta.env.VITE_ARCGIS_API_KEY ?? '';
const arcgisTokenStatus = arcgisKey.length > 0 ? 'own key' : 'Cesium default (dev only)';

const urlState = parseUrlState(window.location.search);

let anchor: SiteAnchor =
  urlState.anchorOverride === undefined
    ? { ...DEMO_ANCHOR }
    : { ...DEMO_ANCHOR, ...urlState.anchorOverride };
let heightSource = 'ellipsoid 0';
let activeStack: MapStack = urlState.stack ?? 'ESRI';
let currentView: ViewpointName = urlState.view ?? 'Aerial';
let renderErrors = 0;
let tileErrors = 0;
let googleStatus = 'not active';
let ready = false;
let placementSnapshot: { anchor: SiteAnchor; heightSource: string } | null = null;
const testEnabled = urlState.test;

for (const [index, warning] of urlState.warnings.entries()) {
  notices.showBanner(`url-warning-${index}`, warning, { tone: 'warn', kind: 'warning' });
}

function updateUrl(): void {
  const search = serializeUrlState({
    anchorOverride: { latDeg: anchor.latDeg, lonDeg: anchor.lonDeg, headingDeg: anchor.headingDeg },
    stack: activeStack,
    view: currentView,
    test: testEnabled,
  });
  window.history.replaceState(null, '', `${window.location.pathname}?${search}`);
}

async function copyLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(window.location.href);
    notices.toast('Link copied');
  } catch {
    notices.toast('Could not copy link');
  }
}

const debugPanel = createDebugPanel(document.body, {
  onCopyLink: () => {
    void copyLink();
  },
});

function refreshDebugPanel(): void {
  debugPanel.set({
    anchor,
    heightSource,
    stack: activeStack,
    tileErrors,
    googleStatus,
    arcgisToken: arcgisTokenStatus,
  });
}

function rebuildScene(): void {
  viewer.entities.removeAll();
  renderElements(viewer, anchor, DEMO_ELEMENTS, {
    onWarning: (message) => {
      notices.showBanner('ring-warning', message, { tone: 'warn' });
    },
  });
  renderAxes(viewer, anchor);
  refreshDebugPanel();
}

function handleStackChange(change: MapStackChange): void {
  activeStack = change.stack;

  if (change.stack === 'GOOGLE_3D' && change.tileset !== null) {
    const tileset = change.tileset;
    void sampleGroundHeight(viewer, tileset, anchor).then((height) => {
      if (height !== null) {
        anchor = { ...anchor, heightM: height };
        heightSource = 'sampled from Google 3D';
      } else {
        anchor = { ...anchor, heightM: 0 };
        heightSource = 'ellipsoid 0 (sample failed)';
      }
      rebuildScene();
    });
    return;
  }

  anchor = { ...anchor, heightM: 0 };
  heightSource = 'ellipsoid 0';
  rebuildScene();
}

const mapStacks = createMapStacks(viewer, {
  googleKey,
  arcgisKey,
  container: document.body,
  notices,
  onStackChange: handleStackChange,
  onTileError: () => {
    tileErrors += 1;
    refreshDebugPanel();
  },
  onGoogleStatus: (status) => {
    googleStatus = status;
    refreshDebugPanel();
  },
});

function setHeading(headingDeg: number): void {
  anchor = { ...anchor, headingDeg: normalizeHeading(headingDeg) };
  rebuildScene();
  updateUrl();
}

async function applyPlacement(latDeg: number, lonDeg: number, headingDeg: number): Promise<void> {
  anchor = { ...anchor, latDeg, lonDeg, headingDeg: normalizeHeading(headingDeg), heightM: 0 };
  heightSource = 'ellipsoid 0';

  if (mapStacks.getActive() === 'GOOGLE_3D') {
    const tileset = mapStacks.getTileset();
    if (tileset !== null) {
      const sampled = await sampleGroundHeight(viewer, tileset, anchor);
      if (sampled !== null) {
        anchor = { ...anchor, heightM: sampled };
        heightSource = 'sampled from Google 3D';
      }
    }
  }

  rebuildScene();
  updateUrl();
  placement.refresh();
}

function placeSite(latDeg: number, lonDeg: number, headingDeg: number): Promise<void> {
  return applyPlacement(latDeg, lonDeg, headingDeg);
}

const placement = createSitePlacement({
  viewer,
  notices,
  getAnchor: () => anchor,
  isGoogleActive: () => mapStacks.getActive() === 'GOOGLE_3D',
  onStart: () => {
    placementSnapshot = { anchor: { ...anchor }, heightSource };
  },
  onPick: (latDeg, lonDeg) => {
    void applyPlacement(latDeg, lonDeg, anchor.headingDeg);
  },
  onHeading: (headingDeg) => {
    setHeading(headingDeg);
  },
  onCancel: () => {
    if (placementSnapshot !== null) {
      anchor = { ...placementSnapshot.anchor };
      heightSource = placementSnapshot.heightSource;
      placementSnapshot = null;
      rebuildScene();
      updateUrl();
    }
  },
});

createViewpointButtons(document.body, (name) => {
  currentView = name;
  updateUrl();
  void flyToViewpoint(viewer, anchor, name);
});

// Defence in depth: if anything still throws inside the render loop, recover instead of stopping.
const restartTimes: number[] = [];
let lastRecoveryToastMs = 0;

viewer.scene.renderError.addEventListener((_scene: unknown, error: unknown) => {
  renderErrors += 1;
  console.error('Render error', error);

  const now = Date.now();
  while (restartTimes.length > 0 && now - (restartTimes[0] ?? 0) > 60_000) {
    restartTimes.shift();
  }

  if (restartTimes.length >= 3) {
    viewer.useDefaultRenderLoop = false;
    notices.showBanner('render-stopped', 'Rendering stopped — reload the page', {
      tone: 'error',
      actionLabel: 'Reload',
      onAction: () => {
        window.location.reload();
      },
    });
    return;
  }

  restartTimes.push(now);
  viewer.useDefaultRenderLoop = true;

  if (now - lastRecoveryToastMs > 5000) {
    lastRecoveryToastMs = now;
    notices.toast('Rendering recovered from an error', 'warn');
  }
});

function waitForNextFrame(): Promise<void> {
  return new Promise<void>((resolve) => {
    const remove = viewer.scene.postRender.addEventListener(() => {
      remove();
      resolve();
    });
  });
}

/**
 * Resolve true once the active imagery/3D tiles are loaded for three consecutive rendered frames,
 * or false on timeout. This is what the smoke tests wait on before taking screenshots.
 */
function waitForTilesLoaded(timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    let consecutive = 0;
    const handles: { timer?: number; remove?: () => void } = {};

    const settle = (loaded: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (handles.timer !== undefined) {
        window.clearTimeout(handles.timer);
      }
      handles.remove?.();
      resolve(loaded);
    };

    handles.remove = viewer.scene.postRender.addEventListener(() => {
      if (settled) {
        return;
      }
      const tileset = mapStacks.getTileset();
      const loaded = tileset !== null ? tileset.tilesLoaded : viewer.scene.globe.tilesLoaded;
      consecutive = loaded ? consecutive + 1 : 0;
      if (consecutive >= 3) {
        settle(true);
      }
    });

    handles.timer = window.setTimeout(() => {
      settle(false);
    }, timeoutMs);
  });
}

if (testEnabled) {
  window.__overlord = {
    get ready() {
      return ready;
    },
    get entityCount() {
      return viewer.entities.values.length;
    },
    get activeStack() {
      return activeStack;
    },
    get anchor() {
      return anchor;
    },
    get renderErrors() {
      return renderErrors;
    },
    get tileErrors() {
      return tileErrors;
    },
    get groundHeight() {
      return { heightM: anchor.heightM, source: heightSource };
    },
    flyTo: (name) => flyToViewpoint(viewer, anchor, name),
    setStack: (stack) => mapStacks.setActive(stack),
    waitForTilesLoaded: (timeoutMs) => waitForTilesLoaded(timeoutMs),
    placeSite: (latDeg, lonDeg, headingDeg) => placeSite(latDeg, lonDeg, headingDeg),
  };
}

async function boot(): Promise<void> {
  await mapStacks.setActive(urlState.stack ?? 'ESRI');
  updateUrl();
  await flyToViewpoint(viewer, anchor, currentView);
  await waitForNextFrame();
  ready = true;
}

void boot().catch((error: unknown) => {
  console.error('Boot failed', error);
  ready = true;
});
