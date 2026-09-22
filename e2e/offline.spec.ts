import { mkdirSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

// Expected entity count: 7 demo elements (main stage, FOH riser, 4 green rooms, audience zone)
// plus 6 axis entities (3 arrows + 3 labels) = 13.
const EXPECTED_ENTITY_COUNT = 13;

mkdirSync('e2e-output', { recursive: true });

async function blockExternalRequests(page: Page): Promise<void> {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return route.continue();
    }
    return route.abort();
  });
}

async function waitForReady(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__overlord?.ready === true, undefined, { timeout: 45_000 });
}

async function flyAndScreenshot(
  page: Page,
  view: 'Aerial' | 'FOH' | 'Stage',
  file: string,
): Promise<void> {
  await page.evaluate(async (name) => {
    await window.__overlord?.flyTo(name);
  }, view);
  await page.screenshot({ path: `e2e-output/${file}` });
}

test('offline: viewer keeps rendering, shows fallback banner and controls stay usable', async ({
  page,
}) => {
  await blockExternalRequests(page);
  await page.goto('/?test=1');
  await waitForReady(page);

  await expect(page.locator('.cesium-widget-errorPanel')).toBeHidden();

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
  await page.goto('/?test=1&lat=22.55&lon=88.34&heading=90&view=FOH');
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
  await page.goto('/?test=1&lat=999&lon=88');
  await waitForReady(page);

  await expect(page.locator('.notice-banner--warning')).toHaveCount(1);

  const anchor = await page.evaluate(() => window.__overlord?.anchor ?? null);
  expect(anchor?.latDeg).toBeCloseTo(22.5579, 6);
  expect(anchor?.lonDeg).toBeCloseTo(88.3439, 6);
});
