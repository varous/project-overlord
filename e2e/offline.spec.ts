import { mkdirSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { createDiagnostics } from './diagnostics.js';

// Expected entity count: 6 scene elements (main stage, FOH riser, 4 green rooms)
// + 1 zone (the audience area polygon) + 6 axis entities (3 arrows + 3 labels) = 13.
const EXPECTED_ENTITY_COUNT = 13;

mkdirSync('e2e-output', { recursive: true });

const diag = createDiagnostics();
test.beforeEach(async ({ page }) => {
  diag.attach(page);
});
test.afterAll(() => {
  diag.write('console.json');
});

async function blockExternalRequests(page: Page): Promise<void> {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return route.continue();
    }
    return route.abort();
  });
}

// The offline suite must never depend on build-time configuration. Every page load uses an
// explicit empty `?api=` override so the app reports "API: not configured" even when CI builds with
// VITE_API_BASE_URL set from the API_BASE_URL repository variable.
const OFFLINE = '/?test=1&api=';

async function waitForReady(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__overlord?.ready === true, undefined, { timeout: 45_000 });
}

async function waitForTiles(page: Page, name: string): Promise<boolean> {
  const loaded = await page.evaluate(async (timeout) => {
    return (await window.__overlord?.waitForTilesLoaded(timeout)) ?? false;
  }, 30_000);
  diag.recordTiles(name, loaded);
  return loaded;
}

async function flyAndScreenshot(
  page: Page,
  view: 'Aerial' | 'FOH' | 'Stage',
  file: string,
): Promise<void> {
  await page.evaluate(async (name) => {
    await window.__overlord?.flyTo(name);
  }, view);
  await waitForTiles(page, file);
  await page.screenshot({ path: `e2e-output/${file}` });
}

test('offline: viewer keeps rendering, shows fallback banner and controls stay usable', async ({
  page,
}) => {
  await blockExternalRequests(page);
  await page.goto(OFFLINE);
  await waitForReady(page);

  await expect(page.locator('.cesium-widget-errorPanel')).toBeHidden();

  // No VITE_API_BASE_URL is configured in the smoke build, so the panel must say so without
  // waiting on any API call.
  await expect(page.locator('.debug-panel')).toContainText('API: not configured');

  const state = await page.evaluate(() => ({
    renderErrors: window.__overlord?.renderErrors ?? -1,
    entityCount: window.__overlord?.entityCount ?? -1,
    // ESRI failed its availability probe, OSM failed too, so the fallback chain ends at OSM
    // with no imagery layer mounted (dark grey globe + geometry only).
    activeStack: window.__overlord?.activeStack ?? 'none',
  }));
  expect(state.renderErrors).toBe(0);
  expect(state.entityCount).toBe(EXPECTED_ENTITY_COUNT);
  expect(state.activeStack).toBe('OSM');

  await expect(page.locator('.notice-banner', { hasText: 'Imagery unavailable' })).toBeVisible();
  // The fallback banner must name a reason, not just say imagery is missing.
  await expect(page.locator('.notice-banner', { hasText: 'probes failed' })).toBeVisible();

  for (const name of ['Aerial', 'FOH', 'Stage'] as const) {
    await expect(page.getByRole('button', { name })).toBeEnabled();
  }
  await page.getByRole('button', { name: 'Aerial' }).click();

  const renderErrorsAfterClick = await page.evaluate(() => window.__overlord?.renderErrors ?? -1);
  expect(renderErrorsAfterClick).toBe(0);

  await flyAndScreenshot(page, 'Aerial', 'offline-aerial.png');
  await flyAndScreenshot(page, 'FOH', 'offline-foh.png');
  await flyAndScreenshot(page, 'Stage', 'offline-stage.png');
});

test('offline: URL anchor override and viewpoint are applied without warnings', async ({ page }) => {
  await blockExternalRequests(page);
  await page.goto('/?test=1&api=&lat=22.55&lon=88.34&heading=90&view=FOH');
  await waitForReady(page);

  const anchor = await page.evaluate(() => window.__overlord?.anchor ?? null);
  expect(anchor).not.toBeNull();
  expect(anchor?.latDeg).toBeCloseTo(22.55, 5);
  expect(anchor?.lonDeg).toBeCloseTo(88.34, 5);
  expect(anchor?.headingDeg).toBeCloseTo(90, 5);

  await expect(page.locator('.notice-banner--warning')).toHaveCount(0);
});

test('offline: invalid lat/lon shows one warning and keeps the default anchor', async ({ page }) => {
  await blockExternalRequests(page);
  await page.goto('/?test=1&api=&lat=999&lon=88');
  await waitForReady(page);

  await expect(page.locator('.notice-banner--warning')).toHaveCount(1);

  const anchor = await page.evaluate(() => window.__overlord?.anchor ?? null);
  expect(anchor?.latDeg).toBeCloseTo(22.5389524, 6);
  expect(anchor?.lonDeg).toBeCloseTo(88.4009058, 6);
});

test('offline: placeSite applies a placement and Escape restores the previous anchor', async ({
  page,
}) => {
  await blockExternalRequests(page);
  await page.goto(OFFLINE);
  await waitForReady(page);

  await page.evaluate(async () => {
    await window.__overlord?.placeSite(22.5601, 88.3452, 30);
  });

  const placed = await page.evaluate(() => ({
    anchor: window.__overlord?.anchor ?? null,
    url: window.location.href,
    entityCount: window.__overlord?.entityCount ?? -1,
    renderErrors: window.__overlord?.renderErrors ?? -1,
  }));

  expect(placed.anchor?.latDeg).toBeCloseTo(22.5601, 6);
  expect(placed.anchor?.lonDeg).toBeCloseTo(88.3452, 6);
  expect(placed.anchor?.headingDeg).toBeCloseTo(30, 6);
  expect(placed.url).toContain('lat=22.5601000');
  expect(placed.url).toContain('lon=88.3452000');
  expect(placed.url).toContain('heading=30.00');
  expect(placed.entityCount).toBe(EXPECTED_ENTITY_COUNT);
  expect(placed.renderErrors).toBe(0);
  await expect(page.locator('.debug-panel')).toContainText('unsaved changes');
  await expect(page.locator('.debug-panel')).toContainText('Kolkata ground demo');

  const beforeMode = placed.anchor;
  await page.getByRole('button', { name: 'Place site' }).click();
  await page.keyboard.press('Escape');

  const restored = await page.evaluate(() => window.__overlord?.anchor ?? null);
  expect(restored?.latDeg).toBeCloseTo(beforeMode?.latDeg ?? 0, 6);
  expect(restored?.lonDeg).toBeCloseTo(beforeMode?.lonDeg ?? 0, 6);
  expect(restored?.headingDeg).toBeCloseTo(beforeMode?.headingDeg ?? 0, 6);
});

test('offline: the camera opens framed on the scene and F re-fits it', async ({ page }) => {
  await blockExternalRequests(page);
  await page.goto(OFFLINE);
  await waitForReady(page);

  const fitted = await page.evaluate(() => window.__overlord?.fittedAltitudeM() ?? 0);
  const bootAltitude = await page.evaluate(() => window.__overlord?.cameraAltitudeM() ?? 0);
  expect(fitted).toBeGreaterThan(0);
  expect(bootAltitude).toBeGreaterThan(fitted * 0.9);
  expect(bootAltitude).toBeLessThan(fitted * 1.1);

  await page.screenshot({ path: 'e2e-output/camera-fit.png' });

  // Move the camera, then press F to re-fit.
  const canvas = await page.locator('#cesium-container canvas').boundingBox();
  await page.mouse.move(canvas.x + 640, canvas.y + 400);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 720, canvas.y + 470, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);

  await page.keyboard.press('F');
  await page.waitForTimeout(2000);
  const refitAltitude = await page.evaluate(() => window.__overlord?.cameraAltitudeM() ?? 0);
  expect(refitAltitude).toBeGreaterThan(fitted * 0.9);
  expect(refitAltitude).toBeLessThan(fitted * 1.1);
});

test('offline: placement is responsive, crosshair, handle-after-pick and click fall-through', async ({
  page,
}) => {
  await blockExternalRequests(page);
  await page.goto(OFFLINE);
  await waitForReady(page);

  const before = await page.evaluate(() => window.__overlord?.anchor ?? null);
  const stackBefore = await page.evaluate(() => window.__overlord?.activeStack ?? 'none');

  await page.getByRole('button', { name: 'Place site' }).click();
  expect(await page.evaluate(() => window.__overlord?.isPlacing())).toBe(true);
  // Entering placement mode must not change the active map stack.
  expect(await page.evaluate(() => window.__overlord?.activeStack ?? 'none')).toBe(stackBefore);

  const cursor = await page.evaluate(
    () => getComputedStyle(document.querySelector('#cesium-container')).cursor,
  );
  expect(cursor).toBe('crosshair');

  // The handle only appears after the first pick.
  expect(await page.evaluate(() => window.__overlord?.hasPlacementHandle())).toBe(false);

  const canvas = await page.locator('#cesium-container canvas').boundingBox();
  const centre = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 };
  await page.mouse.click(centre.x, centre.y);
  await page.waitForTimeout(300);

  const afterFirst = await page.evaluate(() => window.__overlord?.anchor ?? null);
  expect(afterFirst?.latDeg).not.toBe(before?.latDeg);
  expect(await page.evaluate(() => window.__overlord?.hasPlacementHandle())).toBe(true);
  await expect(page.locator('.notice-toast', { hasText: 'Site placed' })).toBeVisible();

  // A click on the handle without movement must place the site (fall-through), not change heading.
  const handle = await page.evaluate(() => window.__overlord?.headingHandleScreen() ?? null);
  expect(handle).not.toBeNull();
  const headingBefore = afterFirst?.headingDeg ?? -1;
  if (handle !== null) {
    await page.mouse.click(canvas.x + handle.x, canvas.y + handle.y);
    await page.waitForTimeout(300);
  }
  const afterSecond = await page.evaluate(() => window.__overlord?.anchor ?? null);
  expect(afterSecond?.latDeg).not.toBe(afterFirst?.latDeg);
  expect(afterSecond?.headingDeg).toBeCloseTo(headingBefore, 5);
});
