/**
 * Base map stack switcher: ESRI (default), OSM, and Google Photorealistic 3D Tiles.
 *
 * Resilience: an imagery provider is only mounted after an availability probe succeeds, so a
 * blocked or broken provider can never feed an undecodable image into the WebGL render loop.
 * The chain is ESRI -> OSM -> no imagery (dark grey globe), and Google 3D falls back to ESRI.
 * Tile errors are counted and surfaced by the caller; they never stop rendering.
 *
 * Cesium's credit container is left untouched so attribution stays visible for every stack.
 */

import * as Cesium from 'cesium';

import type { Notices } from '../ui/notices.js';

export type MapStack = 'ESRI' | 'OSM' | 'GOOGLE_3D';

export interface MapStackChange {
  /** The stack actually in effect after any fallback. */
  stack: MapStack;
  /** Non-null only while GOOGLE_3D is active. */
  tileset: Cesium.Cesium3DTileset | null;
}

export interface MapStacksOptions {
  googleKey: string;
  container: HTMLElement;
  notices: Notices;
  onStackChange: (change: MapStackChange) => void | Promise<void>;
  onTileError: () => void;
}

export interface MapStacksController {
  getActive(): MapStack;
  setActive(stack: MapStack): Promise<void>;
  isEnabled(stack: MapStack): boolean;
}

const STACK_LABELS: Record<MapStack, string> = {
  ESRI: 'ESRI',
  OSM: 'OSM',
  GOOGLE_3D: 'Google 3D',
};

// Public, keyless endpoints used only to decide whether a provider is reachable. Loading a tile
// through an <img> avoids CORS requirements and mirrors how Cesium actually fetches imagery.
const ESRI_PROBE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/0/0/0';
const OSM_PROBE_URL = 'https://tile.openstreetmap.org/0/0/0.png';

function probeImage(url: string, timeoutMs = 5000): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (ok: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      resolve(ok);
    };
    const timer = window.setTimeout(() => {
      image.src = '';
      finish(false);
    }, timeoutMs);
    image.onload = () => {
      finish(true);
    };
    image.onerror = () => {
      finish(false);
    };
    image.src = url;
  });
}

/**
 * Resolve once the tileset has loaded its first tiles (or the timeout elapses). Cesium removed
 * `Cesium3DTileset#readyPromise`, so the load event is used instead.
 */
function waitForInitialTiles(tileset: Cesium.Cesium3DTileset, timeoutMs: number): Promise<void> {
  if (tileset.tilesLoaded) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    const finish = (): void => {
      window.clearTimeout(timer);
      tileset.initialTilesLoaded.removeEventListener(onLoaded);
      resolve();
    };
    const onLoaded = (): void => {
      finish();
    };
    const timer = window.setTimeout(finish, timeoutMs);
    tileset.initialTilesLoaded.addEventListener(onLoaded);
  });
}

export function createMapStacks(
  viewer: Cesium.Viewer,
  options: MapStacksOptions,
): MapStacksController {
  const googleEnabled = options.googleKey.length > 0;

  let active: MapStack = 'ESRI';
  let imageryLayer: Cesium.ImageryLayer | null = null;
  let tileset: Cesium.Cesium3DTileset | null = null;
  let switchToken = 0;

  const toolbar = document.createElement('div');
  toolbar.className = 'map-stacks';
  options.container.appendChild(toolbar);

  const buttons = new Map<MapStack, HTMLButtonElement>();
  const stacks: MapStack[] = ['ESRI', 'OSM', 'GOOGLE_3D'];
  for (const stack of stacks) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = STACK_LABELS[stack];
    if (stack === 'GOOGLE_3D' && !googleEnabled) {
      button.disabled = true;
      button.title = 'No Google key configured';
    }
    button.addEventListener('click', () => {
      void setActive(stack);
    });
    toolbar.appendChild(button);
    buttons.set(stack, button);
  }

  function updateButtons(): void {
    for (const [stack, button] of buttons) {
      button.classList.toggle('active', stack === active);
    }
  }

  function clearImagery(): void {
    if (imageryLayer !== null) {
      viewer.imageryLayers.remove(imageryLayer, true);
      imageryLayer = null;
    }
    viewer.imageryLayers.removeAll();
  }

  function clearTileset(): void {
    if (tileset !== null) {
      viewer.scene.primitives.remove(tileset);
      tileset = null;
    }
  }

  function mountImagery(provider: Cesium.ImageryProvider): void {
    clearImagery();
    const layer = viewer.imageryLayers.addImageryProvider(provider);
    layer.errorEvent.addEventListener(() => {
      options.onTileError();
    });
    imageryLayer = layer;
  }

  async function activateImagery(requested: 'ESRI' | 'OSM', token: number): Promise<void> {
    options.notices.clearBanner('imagery-unavailable');
    options.notices.clearBanner('esri-fallback');
    options.notices.clearBanner('osm-fallback');

    const order: Array<'ESRI' | 'OSM'> = requested === 'ESRI' ? ['ESRI', 'OSM'] : ['OSM', 'ESRI'];

    for (const candidate of order) {
      if (token !== switchToken) {
        return;
      }

      if (candidate === 'ESRI') {
        if (!(await probeImage(ESRI_PROBE_URL))) {
          continue;
        }
        if (token !== switchToken) {
          return;
        }
        try {
          const provider = await Cesium.ArcGisMapServerImageryProvider.fromBasemapType(
            Cesium.ArcGisBaseMapType.SATELLITE,
            { enablePickFeatures: false },
          );
          if (token !== switchToken) {
            return;
          }
          mountImagery(provider);
          if (requested === 'OSM') {
            options.notices.showBanner('osm-fallback', 'OSM imagery unavailable — showing ESRI', {
              tone: 'warn',
            });
          }
          active = 'ESRI';
          updateButtons();
          await options.onStackChange({ stack: 'ESRI', tileset: null });
          return;
        } catch (error) {
          console.warn('ESRI imagery provider failed to initialise', error);
          continue;
        }
      }

      if (!(await probeImage(OSM_PROBE_URL))) {
        continue;
      }
      mountImagery(
        new Cesium.OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' }),
      );
      options.notices.clearBanner('osm-fallback');
      if (requested === 'ESRI') {
        options.notices.showBanner('esri-fallback', 'Esri imagery unavailable — showing OSM', {
          tone: 'warn',
        });
      }
      active = 'OSM';
      updateButtons();
      await options.onStackChange({ stack: 'OSM', tileset: null });
      return;
    }

    // Neither provider could be mounted: keep rendering the geometry on a dark grey globe.
    active = 'OSM';
    viewer.scene.globe.show = true;
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#1b1f27');
    options.notices.showBanner(
      'imagery-unavailable',
      'Imagery unavailable — site geometry is still accurate',
      { tone: 'warn' },
    );
    updateButtons();
    await options.onStackChange({ stack: 'OSM', tileset: null });
  }

  async function setActive(stack: MapStack): Promise<void> {
    if (stack === 'GOOGLE_3D' && !googleEnabled) {
      return;
    }

    const token = ++switchToken;

    if (stack === 'GOOGLE_3D') {
      clearImagery();
      clearTileset();
      options.notices.clearBanner('imagery-unavailable');
      options.notices.clearBanner('esri-fallback');
      options.notices.clearBanner('osm-fallback');
      options.notices.clearBanner('google-fallback');
      viewer.scene.globe.show = false;
      try {
        const created = await Cesium.createGooglePhotorealistic3DTileset({ key: options.googleKey });
        if (token !== switchToken) {
          return;
        }
        const added = viewer.scene.primitives.add(created) as Cesium.Cesium3DTileset;
        tileset = added;
        await waitForInitialTiles(added, 15000);
        if (token !== switchToken) {
          return;
        }
        active = 'GOOGLE_3D';
        updateButtons();
        await options.onStackChange({ stack: 'GOOGLE_3D', tileset });
        return;
      } catch (error) {
        console.warn('Google 3D tileset failed to load', error);
        options.notices.showBanner('google-fallback', 'Google 3D unavailable — showing ESRI imagery', {
          tone: 'warn',
        });
        viewer.scene.globe.show = true;
        clearTileset();
        await activateImagery('ESRI', token);
        return;
      }
    }

    viewer.scene.globe.show = true;
    clearTileset();
    clearImagery();
    await activateImagery(stack, token);
  }

  updateButtons();

  return {
    getActive: () => active,
    setActive,
    isEnabled: (stack) => stack !== 'GOOGLE_3D' || googleEnabled,
  };
}
