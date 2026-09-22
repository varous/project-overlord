/**
 * Base map stack switcher: ESRI (default), OSM, and Google Photorealistic 3D Tiles.
 *
 * Cesium's credit container is left untouched so attribution stays visible for every stack.
 */

import * as Cesium from 'cesium';

export type MapStack = 'ESRI' | 'OSM' | 'GOOGLE_3D';

export interface MapStackChange {
  stack: MapStack;
  /** Non-null only while GOOGLE_3D is active. */
  tileset: Cesium.Cesium3DTileset | null;
}

export interface MapStacksOptions {
  googleKey: string;
  container: HTMLElement;
  onStackChange: (change: MapStackChange) => void | Promise<void>;
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

  async function setActive(stack: MapStack): Promise<void> {
    if (stack === 'GOOGLE_3D' && !googleEnabled) {
      return;
    }

    const token = ++switchToken;
    active = stack;

    if (stack === 'GOOGLE_3D') {
      clearImagery();
      clearTileset();
      if (token !== switchToken) {
        return;
      }
      viewer.scene.globe.show = false;
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
      updateButtons();
      await options.onStackChange({ stack, tileset });
      return;
    }

    viewer.scene.globe.show = true;
    clearTileset();
    clearImagery();
    if (token !== switchToken) {
      return;
    }

    if (stack === 'ESRI') {
      const provider = await Cesium.ArcGisMapServerImageryProvider.fromBasemapType(
        Cesium.ArcGisBaseMapType.SATELLITE,
        { enablePickFeatures: false },
      );
      if (token !== switchToken) {
        return;
      }
      imageryLayer = viewer.imageryLayers.addImageryProvider(provider);
    } else {
      const provider = new Cesium.OpenStreetMapImageryProvider({
        url: 'https://tile.openstreetmap.org/',
      });
      imageryLayer = viewer.imageryLayers.addImageryProvider(provider);
    }

    updateButtons();
    await options.onStackChange({ stack, tileset: null });
  }

  void setActive('ESRI');

  return {
    getActive: () => active,
    setActive,
    isEnabled: (stack) => stack !== 'GOOGLE_3D' || googleEnabled,
  };
}
