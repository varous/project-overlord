import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page, type Route } from '@playwright/test';

import type { SceneDoc } from '@overlord/scene';

import { createDiagnostics } from './diagnostics.js';

/**
 * Persistence flow with a stubbed API (no server needed).
 *
 * The app is built once; the API origin is injected at runtime via `?api=<origin>` (see
 * `apps/web/src/site/urlState.ts`), so a single preview build serves both the offline and the
 * stubbed persistence suites. Every request to the stub origin is intercepted with canned JSON.
 */

const API_ORIGIN = 'https://api.stub.test';
const SCENE_ID = 'scn_stub0000000000000000';
const LATEST_VERSION = 3;

mkdirSync('e2e-output', { recursive: true });

const diag = createDiagnostics();
test.beforeEach(async ({ page }) => {
  diag.attach(page);
});
// console.json is written by offline.spec.ts; this suite only needs it for failure debugging.

const demoDoc = JSON.parse(
  readFileSync(fileURLToPath(new URL('../contracts/scene/v2/examples/demo-scene.json', import.meta.url)), 'utf8'),
) as SceneDoc;

interface StubState {
  conflict: boolean;
  unauthorized: boolean;
  healthDown: boolean;
  createBodies: Array<{ name?: string; message?: string; doc?: SceneDoc }>;
  commitBodies: Array<{ parentVersion: number; message: string }>;
}

function makeState(): StubState {
  return { conflict: false, unauthorized: false, healthDown: false, createBodies: [], commitBodies: [] };
}

async function blockExternalRequests(page: Page): Promise<void> {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return route.continue();
    }
    return route.abort();
  });
}

function versionDoc(version: number): SceneDoc {
  const doc = structuredClone(demoDoc);
  if (version === 2) {
    doc.elements = doc.elements.slice(0, -1);
  }
  return doc;
}

/** Register the stub AFTER the block route so it takes precedence for the stub origin. */
async function stubApi(page: Page, state: StubState): Promise<void> {
  await page.route(`${API_ORIGIN}/**`, (route: Route) => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname;
    const json = (status: number, body: unknown): Promise<void> =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'GET' && path === '/health') {
      if (state.healthDown) {
        return json(503, { status: 'down' });
      }
      return json(200, { status: 'ok', db: 'up', commit: 'abcdef1234567890', startedAt: 't0' });
    }
    if (method === 'GET' && path === '/scenes') {
      return json(200, {
        scenes: [
          { id: SCENE_ID, name: 'Stubbed night show', latestVersion: LATEST_VERSION, updatedAt: '2026-09-23T11:40:00.000Z' },
          { id: 'scn_second0000000000000', name: 'Stubbed arena', latestVersion: 1, updatedAt: '2026-09-20T09:00:00.000Z' },
        ],
        nextCursor: null,
      });
    }
    if (method === 'POST' && path === '/scenes') {
      state.createBodies.push(request.postDataJSON() as StubState['createBodies'][number]);
      if (state.unauthorized) {
        return json(401, { error: 'UNAUTHORIZED', message: 'Missing or invalid bearer token' });
      }
      return json(201, { sceneId: SCENE_ID, version: 1, contentHash: 'a'.repeat(64) });
    }
    const versionsPath = /^\/scenes\/([^/]+)\/versions$/.exec(path);
    if (method === 'GET' && versionsPath !== null) {
      return json(200, [
        { version: 3, parentVersion: 2, createdAt: '2026-09-23T11:00:00.000Z', author: 'Ada', message: 'latest', contentHash: 'c3' },
        { version: 2, parentVersion: 1, createdAt: '2026-09-22T11:00:00.000Z', author: 'Ada', message: 'earlier', contentHash: 'c2' },
        { version: 1, parentVersion: null, createdAt: '2026-09-21T11:00:00.000Z', author: 'Ada', message: 'initial', contentHash: 'c1' },
      ]);
    }
    if (method === 'POST' && versionsPath !== null) {
      const body = request.postDataJSON() as { parentVersion: number; message: string };
      state.commitBodies.push(body);
      if (state.conflict) {
        return json(409, {
          error: 'VERSION_CONFLICT',
          message: 'parentVersion does not match the latest version',
          details: { latestVersion: body.parentVersion + 1 },
        });
      }
      return json(201, { version: body.parentVersion + 1, contentHash: 'b'.repeat(64) });
    }
    const sharePath = /^\/scenes\/([^/]+)\/shares$/.exec(path);
    if (method === 'POST' && sharePath !== null) {
      return json(201, { token: 'tok_stub', url: 'https://web.stub.test/?share=tok_stub' });
    }
    const versionPath = /^\/scenes\/([^/]+)\/versions\/(.+)$/.exec(path);
    if (method === 'GET' && versionPath !== null) {
      const raw = versionPath[2] ?? 'latest';
      const version = raw === 'latest' ? LATEST_VERSION : Number(raw);
      return json(200, {
        sceneId: versionPath[1],
        version,
        parentVersion: version > 1 ? version - 1 : null,
        createdAt: '2026-09-23T11:00:00.000Z',
        author: 'Ada',
        message: version === LATEST_VERSION ? 'latest' : `version ${version}`,
        contentHash: `hash-v${version}`,
        doc: versionDoc(version),
      });
    }
    const shareGet = /^\/shares\/(.+)$/.exec(path);
    if (method === 'GET' && shareGet !== null) {
      return json(200, { sceneId: SCENE_ID, version: 1, name: demoDoc.name, doc: demoDoc });
    }
    return json(404, { error: 'NOT_FOUND', message: `no stub for ${method} ${path}` });
  });
}

async function waitForReady(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__overlord?.ready === true, undefined, { timeout: 45_000 });
}

async function connect(page: Page): Promise<void> {
  await page.locator('[data-action="connect"]').click();
  await page.getByLabel('Access key').fill('test-access-key');
  await page.getByLabel('Author name').fill('Ada');
  await page.locator('[data-action="connect-save"]').click();
  await expect(page.locator('.debug-panel')).toContainText('Access: connected as Ada');
}

/** Boot with the stub API configured and (optionally) connected. */
async function setUp(page: Page, state: StubState, query = ''): Promise<void> {
  await blockExternalRequests(page);
  await stubApi(page, state);
  await page.goto(`/?test=1&api=${encodeURIComponent(API_ORIGIN)}${query}`);
  await waitForReady(page);
}

test('persistence: connect runs health and shows up', async ({ page }) => {
  const state = makeState();
  await setUp(page, state);

  // Before connecting, the save controls are visible but disabled with the connect tooltip.
  const saveButton = page.locator('[data-action="save"]');
  await expect(saveButton).toBeVisible();
  await expect(saveButton).toBeDisabled();
  await expect(saveButton).toHaveAttribute('title', 'Connect to the API to save');

  await connect(page);

  await expect(page.locator('.debug-panel')).toContainText('API: up (commit abcdef1)');
  await expect(page.locator('.debug-panel')).toContainText('Access: connected as Ada');
});

test('persistence: Save on an unsaved scene creates it and toasts Saved v1', async ({ page }) => {
  const state = makeState();
  await setUp(page, state);
  await connect(page);

  // Saving with no changes is disabled; place the site first so there is something to save.
  await page.evaluate(async () => {
    await window.__overlord?.placeSite(22.5601, 88.3452, 30);
  });
  await page.locator('[data-action="save"]').click();

  await expect(page.locator('.notice-toast', { hasText: 'Saved v1' })).toBeVisible();
  expect(state.createBodies).toHaveLength(1);
  expect(state.createBodies[0]?.name).toBe('Kolkata ground demo');
  expect(state.createBodies[0]?.doc?.elements).toHaveLength(6);
  await expect(page.locator('.debug-panel')).toContainText('(v1)');
});

test('persistence: edit then Save commits with parentVersion 1 and toasts Saved v2', async ({ page }) => {
  const state = makeState();
  await setUp(page, state);
  await connect(page);

  await page.evaluate(async () => {
    await window.__overlord?.placeSite(22.5601, 88.3452, 30);
  });
  await page.locator('[data-action="save"]').click();
  await expect(page.locator('.notice-toast', { hasText: 'Saved v1' })).toBeVisible();

  await page.evaluate(async () => {
    await window.__overlord?.placeSite(22.5612, 88.3461, 45);
  });
  await page.locator('[data-action="save"]').click();

  await expect(page.locator('.notice-toast', { hasText: 'Saved v2' })).toBeVisible();
  expect(state.commitBodies).toHaveLength(1);
  expect(state.commitBodies[0]?.parentVersion).toBe(1);
});

test('persistence: a 409 shows the conflict banner with both actions', async ({ page }) => {
  const state = makeState();
  await setUp(page, state);
  await connect(page);

  await page.evaluate(async () => {
    await window.__overlord?.placeSite(22.5601, 88.3452, 30);
  });
  await page.locator('[data-action="save"]').click();
  await expect(page.locator('.notice-toast', { hasText: 'Saved v1' })).toBeVisible();

  state.conflict = true;
  await page.evaluate(async () => {
    await window.__overlord?.placeSite(22.5612, 88.3461, 45);
  });
  await page.locator('[data-action="save"]').click();

  const banner = page.locator('.notice-banner', { hasText: 'changed elsewhere' });
  await expect(banner).toBeVisible();
  await expect(banner.getByRole('button', { name: 'Reload latest version' })).toBeVisible();
  await expect(banner.getByRole('button', { name: 'Save as new scene' })).toBeVisible();
  await page.screenshot({ path: 'e2e-output/persistence-conflict-banner.png' });
});

test('persistence: Open dialog lists scenes and loads one into the URL; Versions panel + read-only view', async ({
  page,
}) => {
  const state = makeState();
  await setUp(page, state);
  await connect(page);

  await page.locator('[data-action="open"]').click();
  const dialog = page.locator('.modal[data-modal="scenes"]');
  await expect(dialog.locator('.modal__row')).toHaveCount(2);
  await expect(dialog).toContainText('Stubbed night show');
  await page.screenshot({ path: 'e2e-output/persistence-open-dialog.png' });

  await dialog.locator('.modal__row').first().click();
  await expect(page).toHaveURL(new RegExp(`scene=${SCENE_ID}`));
  await expect(page).toHaveURL(/v=3/);

  await page.locator('[data-action="versions"]').click();
  const versionsPanel = page.locator('.modal[data-modal="versions"]');
  await expect(versionsPanel.locator('.modal__row')).toHaveCount(3);
  await page.screenshot({ path: 'e2e-output/persistence-versions-panel.png' });

  // Loading a non-latest version is read-only and summarises the diff against the latest.
  await versionsPanel.locator('.modal__row[data-version="2"]').click();
  const banner = page.locator('.notice-banner', { hasText: 'Viewing v2 of 3 (read-only)' });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('1 removed');
  await expect(banner.getByRole('button', { name: 'Make this the latest' })).toBeVisible();
  expect(await page.evaluate(() => window.__overlord?.readOnly)).toBe(true);
});

test('persistence: ?share=<token> renders read-only with no Save button', async ({ page }) => {
  const state = makeState();
  await setUp(page, state, '&share=tok_stub');

  await expect(
    page.locator('.notice-banner', { hasText: 'Shared view — Kolkata ground demo, v1 (read-only)' }),
  ).toBeVisible();
  await expect(page.locator('[data-action="save"]')).toBeHidden();
  await expect(page.locator('[data-action="save-as-new"]')).toBeHidden();
  expect(await page.evaluate(() => window.__overlord?.readOnly)).toBe(true);
  await page.screenshot({ path: 'e2e-output/persistence-shared-readonly.png' });
});

test('persistence: a 401 shows not connected rather than crashing', async ({ page }) => {
  const state = makeState();
  await setUp(page, state);
  await connect(page);

  state.unauthorized = true;
  await page.evaluate(async () => {
    await window.__overlord?.placeSite(22.5601, 88.3452, 30);
  });
  await page.locator('[data-action="save"]').click();

  await expect(page.locator('.debug-panel')).toContainText('Access: not connected');
  await expect(page.locator('.cesium-widget-errorPanel')).toBeHidden();
});

test('persistence: connecting while the API is down reports the error without a crash', async ({ page }) => {
  const state = makeState();
  state.healthDown = true;
  await setUp(page, state);

  await page.locator('[data-action="connect"]').click();
  await page.getByLabel('Access key').fill('test-access-key');
  await page.getByLabel('Author name').fill('Ada');
  await page.locator('[data-action="connect-save"]').click();

  const panel = page.locator('.modal[data-modal="account"]');
  await expect(panel.locator('.modal__message')).toContainText('HTTP_ERROR');
  await expect(page.locator('.debug-panel')).toContainText('API: down');
  await expect(page.locator('.debug-panel')).toContainText('Access: connected as Ada');
  await expect(page.locator('.cesium-widget-errorPanel')).toBeHidden();
});
