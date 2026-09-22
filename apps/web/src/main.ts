import 'cesium/Build/Cesium/Widgets/widgets.css';

import * as Cesium from 'cesium';

import type { SiteAnchor } from '@overlord/geo-core';

import { DEMO_ANCHOR, DEMO_ELEMENTS } from './site/demoSite.js';
import { renderAxes } from './viewer/axes.js';
import { sampleGroundHeight } from './viewer/groundHeight.js';
import { createMapStacks, type MapStack, type MapStackChange } from './viewer/mapStacks.js';
import { renderElements } from './viewer/render.js';
import { createViewpointButtons } from './viewer/viewpoints.js';
import { createDebugPanel } from './ui/debugPanel.js';
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
});

const googleKey = import.meta.env.VITE_GOOGLE_MAPS_KEY ?? '';

let anchor: SiteAnchor = { ...DEMO_ANCHOR };
let heightSource = 'ellipsoid 0';
let activeStack: MapStack = 'ESRI';

const debugPanel = createDebugPanel(document.body);

function rebuildScene(): void {
  viewer.entities.removeAll();
  renderElements(viewer, anchor, DEMO_ELEMENTS);
  renderAxes(viewer, anchor);
  debugPanel.set({ anchor, heightSource, stack: activeStack });
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

createMapStacks(viewer, {
  googleKey,
  container: document.body,
  onStackChange: handleStackChange,
});

createViewpointButtons(viewer, () => anchor, document.body);

// Draw immediately; the ESRI stack load also triggers a rebuild when it finishes.
rebuildScene();
