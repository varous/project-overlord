import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { createDiagnostics } from './diagnostics.js';

const OUT_DIR = 'e2e-output';

test.skip(process.env.SMOKE_ONLINE !== '1', 'set SMOKE_ONLINE=1 to run the online smoke tests');

mkdirSync(OUT_DIR, { recursive: true });

const diag = createDiagnostics();
test.beforeEach(async ({ page }) => {
  diag.attach(page);
});
test.afterAll(() => {
  diag.write('console.json');
});

async function waitForReady(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__overlord?.ready === true, undefined, { timeout: 60_000 });
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
  await page.screenshot({ path: join(OUT_DIR, file) });
}

test('online: ESRI imagery renders on the ellipsoid', async ({ page }) => {
  await page.goto('/?test=1&stack=ESRI');
  await waitForReady(page);

  const activeStack = await page.evaluate(() => window.__overlord?.activeStack ?? 'none');
  expect(['ESRI', 'OSM']).toContain(activeStack);

  await waitForTiles(page, 'online-esri-initial');

  await flyAndScreenshot(page, 'Aerial', 'online-esri-aerial.png');
  await flyAndScreenshot(page, 'FOH', 'online-esri-foh.png');
  await flyAndScreenshot(page, 'Stage', 'online-esri-stage.png');

  await page.evaluate(async () => {
    await window.__overlord?.placeSite(22.5601, 88.3452, 30);
  });
  await flyAndScreenshot(page, 'Aerial', 'online-esri-placed-aerial.png');
});

test('online: Google 3D when a key is configured', async ({ page }) => {
  await page.goto('/?test=1');
  await waitForReady(page);

  const googleEnabled = await page.getByRole('button', { name: 'Google 3D' }).isEnabled();

  if (!googleEnabled) {
    writeFileSync(join(OUT_DIR, 'ground-height.json'), JSON.stringify({ skipped: 'no google key' }, null, 2));
    return;
  }

  await page.evaluate(async () => {
    await window.__overlord?.setStack('GOOGLE_3D');
  });
  await waitForTiles(page, 'online-google-initial');

  const groundHeight = await page.evaluate(() => window.__overlord?.groundHeight ?? null);
  const anchor = await page.evaluate(() => window.__overlord?.anchor ?? null);
  writeFileSync(
    join(OUT_DIR, 'ground-height.json'),
    JSON.stringify(
      {
        heightM: groundHeight?.heightM ?? null,
        source: groundHeight?.source ?? null,
        lat: anchor?.latDeg ?? null,
        lon: anchor?.lonDeg ?? null,
      },
      null,
      2,
    ),
  );

  await flyAndScreenshot(page, 'Aerial', 'online-google-aerial.png');
  await flyAndScreenshot(page, 'FOH', 'online-google-foh.png');
  await flyAndScreenshot(page, 'Stage', 'online-google-stage.png');
});
