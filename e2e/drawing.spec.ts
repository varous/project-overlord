import { mkdirSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { zoneAreaSqFt } from '@overlord/scene';

import { createDiagnostics } from './diagnostics.js';

/**
 * Drawing and zone-capacity flow. External requests are blocked and the app loads with an explicit
 * empty `?api=` override, so this suite never depends on build-time configuration.
 */

mkdirSync('e2e-output', { recursive: true });

const diag = createDiagnostics();
test.beforeEach(async ({ page }) => {
  diag.attach(page);
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

async function waitForReady(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__overlord?.ready === true, undefined, { timeout: 45_000 });
}

async function setUp(page: Page): Promise<void> {
  await blockExternalRequests(page);
  await page.goto('/?test=1&api=');
  await waitForReady(page);
}

test('drawing: a rectangle zone gets the exact area and pax, and a vertex edit is one undo step', async ({
  page,
}) => {
  await setUp(page);

  const before = await page.evaluate(() => window.__overlord?.docHash() ?? '');
  const zoneId = await page.evaluate(() =>
    window.__overlord?.addRectangleZone({ x: 0, y: 0, z: 0 }, 100 * 3048, 100 * 3048, 'AUDIENCE', 'Test zone') ?? null,
  );
  expect(zoneId).not.toBeNull();

  const zone = await page.evaluate(
    (id) => window.__overlord?.doc().zones.find((candidate) => candidate.id === id) ?? null,
    zoneId,
  );
  expect(zone).not.toBeNull();
  if (zone === null) {
    return;
  }
  expect(zone.label).toBe('Test zone');
  expect(zone.kind).toBe('AUDIENCE');
  expect(zone.densitySqFtPerPerson.value).toBe(5);
  expect(zoneAreaSqFt(zone.ring.value)).toBe(10000);
  expect(Math.floor(zoneAreaSqFt(zone.ring.value) / 5)).toBe(2000);

  // The zone is selected: handles are drawn and the capacity chip shows the readout.
  await expect(page.locator('.draw-chip')).toContainText('10,000 sq ft · 2,000 pax @ 5 sq ft/person');
  await expect(page.locator('.inspector__readout')).toContainText('10,000 sq ft · 2,000 pax @ 5');
  await expect(page.locator('.inspector').getByLabel('Type')).toHaveValue(/AUDIENCE/);
  await expect(page.locator('.inspector [aria-label="Density"]')).toHaveValue('5');
  await page.screenshot({ path: 'e2e-output/drawing-zone-edit.png' });

  // Move one vertex: exactly one command, the area changes, and undo restores the same hash.
  const beforeMove = await page.evaluate(() => window.__overlord?.docHash() ?? '');
  const depthBefore = await page.evaluate(() => window.__overlord?.historyDepth() ?? -1);
  const moved = await page.evaluate(
    ([id]) => window.__overlord?.moveZoneVertex(id, 0, -10 * 3048, -10 * 3048) ?? false,
    [zoneId],
  );
  expect(moved).toBe(true);
  const depthAfter = await page.evaluate(() => window.__overlord?.historyDepth() ?? -1);
  expect(depthAfter).toBe(depthBefore + 1);

  const after = await page.evaluate(
    (id) => window.__overlord?.doc().zones.find((candidate) => candidate.id === id) ?? null,
    zoneId,
  );
  if (after !== null) {
    expect(zoneAreaSqFt(after.ring.value)).not.toBe(10000);
  }

  await page.evaluate(() => window.__overlord?.undo());
  expect(await page.evaluate(() => window.__overlord?.docHash() ?? '')).toBe(beforeMove);
  expect(before).not.toBe(beforeMove);
});

test('drawing: a self-intersecting polygon is refused and no zone is added', async ({ page }) => {
  await setUp(page);
  const zonesBefore = await page.evaluate(() => window.__overlord?.doc().zones.length ?? -1);

  const result = await page.evaluate(() =>
    window.__overlord?.drawPolygon(
      [
        { x: 0, y: 0 },
        { x: 100 * 3048, y: 100 * 3048 },
        { x: 100 * 3048, y: 0 },
        { x: 0, y: 100 * 3048 },
      ],
      'OTHER',
      'Bad polygon',
    ) ?? { ok: false },
  );
  expect(result.ok).toBe(false);
  expect(await page.evaluate(() => window.__overlord?.doc().zones.length ?? -1)).toBe(zonesBefore);
});

test('drawing: editing the density to 8 lowers the pax, and a measurement persists', async ({ page }) => {
  await setUp(page);

  const zoneId = await page.evaluate(() =>
    window.__overlord?.addRectangleZone({ x: 0, y: 0, z: 0 }, 100 * 3048, 100 * 3048, 'FNB', 'Density zone') ?? null,
  );
  expect(zoneId).not.toBeNull();

  // Change the density through the inspector input (the same SET_ZONE_DENSITY path).
  const density = page.locator('.inspector [aria-label="Density"]');
  await density.fill('8');
  await density.press('Tab');

  const zone = await page.evaluate(
    (id) => window.__overlord?.doc().zones.find((candidate) => candidate.id === id) ?? null,
    zoneId,
  );
  if (zone !== null) {
    expect(zone.densitySqFtPerPerson.value).toBe(8);
    expect(Math.floor(zoneAreaSqFt(zone.ring.value) / 8)).toBe(1250);
  }
  await expect(page.locator('.inspector__readout')).toContainText('1,250 pax @ 8 sq ft/person');

  // A measurement is stored on the scene and rendered.
  const measurementId = await page.evaluate(() =>
    window.__overlord?.addMeasurement(
      'DISTANCE',
      [
        { x: 0, y: 0, z: 0 },
        { x: 100 * 3048, y: 0, z: 0 },
      ],
      'Distance measurement',
    ) ?? null,
  );
  expect(measurementId).not.toBeNull();
  expect(await page.evaluate(() => window.__overlord?.doc().measurements.length ?? -1)).toBe(1);
  expect(await page.evaluate((id) => window.__overlord?.hasEntity(id) ?? false, measurementId)).toBe(
    true,
  );

  // The scene capacity panel lists the zone and the total.
  await page.locator('.capacity-panel__summary').click();
  const panel = page.locator('.capacity-panel');
  await expect(panel).toContainText('Density zone');
  await expect(panel).toContainText('1,250 pax @ 8');
  await expect(panel).toContainText('Total —');
  await page.screenshot({ path: 'e2e-output/drawing-capacity-panel.png' });
});
