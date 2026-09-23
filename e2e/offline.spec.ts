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
  expect(anchor?.latDeg).toBeCloseTo(22.5579, 6);
  expect(anchor?.lonDeg).toBeCloseTo(88.3439, 6);
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
  await expect(page.locator('.debug-panel')).toContainText('Brigade Parade Ground demo');

  const beforeMode = placed.anchor;
  await page.getByRole('button', { name: 'Place site' }).click();
  await page.keyboard.press('Escape');

  const restored = await page.evaluate(() => window.__overlord?.anchor ?? null);
  expect(restored?.latDeg).toBeCloseTo(beforeMode?.latDeg ?? 0, 6);
  expect(restored?.lonDeg).toBeCloseTo(beforeMode?.lonDeg ?? 0, 6);
  expect(restored?.headingDeg).toBeCloseTo(beforeMode?.headingDeg ?? 0, 6);
});
