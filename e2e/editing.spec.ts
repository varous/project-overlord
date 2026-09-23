import { mkdirSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { SNAP_MODULE_10FT, snapLengthTmm } from '@overlord/commands';

import { createDiagnostics } from './diagnostics.js';

/**
 * Editing flow with the palette, inspector and command history. No API is needed: the suite loads
 * with an explicit empty `?api=` override and blocks every external request.
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

function snap(value: number): number {
  return snapLengthTmm(value as never, SNAP_MODULE_10FT);
}

test('editing: palette add, inspector, move, rotate, undo/redo and delete', async ({ page }) => {
  await blockExternalRequests(page);
  await page.goto('/?test=1&api=');
  await waitForReady(page);

  const originalHash = await page.evaluate(() => window.__overlord?.docHash() ?? '');
  const originalCount = await page.evaluate(() => window.__overlord?.elementCount() ?? -1);
  await expect(page.locator('[data-action="undo"]')).toBeDisabled();

  // --- Palette -------------------------------------------------------------------------------
  await page.locator('[data-action="add"]').click();
  const palette = page.locator('.modal[data-modal="palette"]');
  await expect(palette).toBeVisible();
  await expect(palette).toContainText('Food stall');
  await expect(palette).toContainText('ft');
  await page.screenshot({ path: 'e2e-output/editing-palette.png' });

  // --- Pending add ---------------------------------------------------------------------------
  await palette.locator('[data-type-code="FOOD_STALL"]').click();
  const startX = snap(50000);
  const startY = snap(50000);
  await page.evaluate(([x, y]) => window.__overlord?.placePending(x, y), [startX, startY]);

  const afterAdd = await page.evaluate(() => ({
    count: window.__overlord?.elementCount() ?? -1,
    selection: window.__overlord?.selection() ?? null,
  }));
  expect(afterAdd.count).toBe(originalCount + 1);
  const elementId = afterAdd.selection?.id ?? '';
  expect(elementId).not.toBe('');
  expect(afterAdd.selection?.kind).toBe('element');

  const added = await page.evaluate((id) => window.__overlord?.element(id) ?? null, elementId);
  expect(added?.label).toBe('Food stall 1');
  expect(added?.placement.value.center.x).toBe(startX);
  expect(added?.placement.value.center.y).toBe(startY);

  // --- Inspector -----------------------------------------------------------------------------
  const inspector = page.locator('.inspector');
  await expect(inspector).toBeVisible();
  await expect(inspector.getByLabel('Type')).toHaveValue(/Food stall/);
  await expect(inspector.getByLabel('Label')).toHaveValue('Food stall 1');
  await expect(inspector).toContainText('STATED');
  await expect(page.locator('[data-action="undo"]')).toBeEnabled();
  await page.screenshot({ path: 'e2e-output/editing-inspector.png' });

  // --- Move to a snapped position ------------------------------------------------------------
  const target = { x: snap(80000), y: snap(40000), z: 0 };
  await page.evaluate(
    ([id, center]) => window.__overlord?.runCommand({ type: 'MOVE_ELEMENT_ABSOLUTE', id, center }),
    [elementId, target] as const,
  );
  const moved = await page.evaluate((id) => window.__overlord?.element(id)?.placement.value.center ?? null, elementId);
  expect(moved?.x).toBe(target.x);
  expect(moved?.y).toBe(target.y);
  expect(moved?.x).toBe(91440);
  expect(moved?.y).toBe(30480);

  // --- Rotate --------------------------------------------------------------------------------
  await page.evaluate((id) => window.__overlord?.runCommand({ type: 'ROTATE_ELEMENT', id, rotationDeg: 90 }), elementId);
  const rotation = await page.evaluate((id) => window.__overlord?.element(id)?.placement.value.rotationDeg ?? -1, elementId);
  expect(rotation).toBe(90);

  // --- Undo back to the saved state ----------------------------------------------------------
  await page.evaluate(() => {
    window.__overlord?.undo();
    window.__overlord?.undo();
    window.__overlord?.undo();
  });
  expect(await page.evaluate(() => window.__overlord?.docHash() ?? '')).toBe(originalHash);
  expect(await page.evaluate(() => window.__overlord?.elementCount() ?? -1)).toBe(originalCount);

  // --- Redo once brings the add back ---------------------------------------------------------
  await page.evaluate(() => window.__overlord?.redo());
  expect(await page.evaluate(() => window.__overlord?.elementCount() ?? -1)).toBe(originalCount + 1);

  // --- Delete --------------------------------------------------------------------------------
  await page.evaluate((id) => window.__overlord?.select('element', id), elementId);
  await page.locator('.inspector [data-action="delete-element"]').click();
  expect(await page.evaluate(() => window.__overlord?.elementCount() ?? -1)).toBe(originalCount);
  expect(await page.evaluate(() => window.__overlord?.docHash() ?? '')).toBe(originalHash);
});
