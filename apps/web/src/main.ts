import 'cesium/Build/Cesium/Widgets/widgets.css';

import * as Cesium from 'cesium';

import type { SiteAnchor } from '@overlord/geo-core';
import {
  canonicalJson,
  diffScenes,
  elementTypeRegistry,
  summariseDiff,
  validateScene,
  type SceneDoc,
} from '@overlord/scene';

import { createApiClient, type ApiClient, type ApiError, type VersionDetail } from './api/client.js';
import { createSessionStore, type Session } from './api/session.js';
import { demoScene } from './site/demoSite.js';
import { normalizeHeading, parseUrlState, serializeUrlState } from './site/urlState.js';
import { createHistory, SNAP_MODULE_10FT, snapLengthTmm, type Command } from '@overlord/commands';
import { renderAxes } from './viewer/axes.js';
import { sampleGroundHeight } from './viewer/groundHeight.js';
import { createMapStacks, type MapStack, type MapStackChange } from './viewer/mapStacks.js';
import { renderScene } from './viewer/render.js';
import { renderQualityFor } from './viewer/renderQuality.js';
import { createViewpointButtons, flyToViewpoint, type ViewpointName } from './viewer/viewpoints.js';
import { createDebugPanel } from './ui/debugPanel.js';
import { createDirectManipulation, pickedEntityId } from './ui/directManipulation.js';
import { createInspector, type Selection } from './ui/inspector.js';
import { createNotices } from './ui/notices.js';
import { createPalette } from './ui/palette.js';
import { createPersistenceUi, type SceneListItem, type VersionListItem } from './ui/persistence.js';
import type { DisplayUnit } from './ui/units.js';
import { createSitePlacement, type SitePlacementController } from './ui/placeSite.js';
import { pickGroundGeodetic } from './viewer/sitePicker.js';
import { geodeticToLocal, type LocalPoint } from '@overlord/geo-core';
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
  // Never show Cesium's blocking render-error panel; renderError recovery handles it instead.
  showRenderLoopErrors: false,
});

const notices = createNotices(document.body);
const googleKey = import.meta.env.VITE_GOOGLE_MAPS_KEY ?? '';
const arcgisKey = import.meta.env.VITE_ARCGIS_API_KEY ?? '';
const arcgisTokenStatus = arcgisKey.length > 0 ? 'own key' : 'Cesium default (dev only)';

const urlState = parseUrlState(window.location.search);
const testEnabled = urlState.test;
const quality = renderQualityFor(testEnabled);
if (quality.globeMaximumScreenSpaceError !== null) {
  viewer.scene.globe.maximumScreenSpaceError = quality.globeMaximumScreenSpaceError;
}

// The API origin: an explicit `?api=` runtime override (kept out of the key story) or the build-time
// VITE_API_BASE_URL. Never carries the access key.
const apiBaseUrl = (urlState.api ?? import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
const currentShareToken = urlState.share;

const sessionStore = createSessionStore();
let session: Session = sessionStore.get();
let connected = session.accessKey !== '';
let apiStatus = apiBaseUrl === '' ? 'not configured' : 'down';
let accessLabel = connected ? `connected as ${session.author === '' ? 'unknown' : session.author}` : 'not connected';

const apiClient: ApiClient | null =
  apiBaseUrl === ''
    ? null
    : createApiClient({
        baseUrl: apiBaseUrl,
        getToken: () => session.accessKey,
        getAuthor: () => (session.author === '' ? 'unknown' : session.author),
      });

// The in-memory scene document, what it was loaded from, and read-only state.
let currentDoc: SceneDoc = structuredClone(demoScene);
let loadedCanonical = canonicalJson(demoScene);
let loadedFrom: { sceneId: string; version: number } | null = null;
let viewingVersion: number | null = null;
let latestVersion: number | null = null;
let readOnly = false;

let anchor: SiteAnchor =
  urlState.anchorOverride === undefined
    ? { ...currentDoc.site.anchor.value }
    : { ...currentDoc.site.anchor.value, ...urlState.anchorOverride };
let heightSource = 'ellipsoid 0';
let activeStack: MapStack = urlState.stack ?? 'ESRI';
let currentView: ViewpointName = urlState.view ?? 'Aerial';
let renderErrors = 0;
let tileErrors = 0;
let googleStatus = 'not active';
let ready = false;
let placementSnapshot: {
  anchor: SiteAnchor;
  heightSource: string;
  docAnchor: SceneDoc['site']['anchor'];
} | null = null;

// --- Editing state (Task 008). Every change goes through @overlord/commands. ---
const history = createHistory(currentDoc);
let selected: Selection | null = null;
let displayUnit: DisplayUnit = 'ft';
let pendingType: string | null = null;
let idCounter = 0;

function newId(): string {
  idCounter += 1;
  let candidate = `el_${idCounter}`;
  while (
    currentDoc.elements.some((element) => element.id === candidate) ||
    currentDoc.zones.some((zone) => zone.id === candidate)
  ) {
    idCounter += 1;
    candidate = `el_${idCounter}`;
  }
  return candidate;
}

const applyCtx = { registry: elementTypeRegistry, newId };

for (const [index, warning] of urlState.warnings.entries()) {
  notices.showBanner(`url-warning-${index}`, warning, { tone: 'warn', kind: 'warning' });
}

const validation = validateScene(demoScene, elementTypeRegistry);
if (!validation.ok) {
  const shown = validation.issues.slice(0, 5);
  shown.forEach((issue, index) => {
    notices.showBanner(`scene-issue-${index}`, `${issue.code} at ${issue.path}: ${issue.message}`, {
      tone: 'warn',
      kind: 'warning',
    });
  });
  if (validation.issues.length > shown.length) {
    notices.showBanner('scene-issue-more', `+${validation.issues.length - shown.length} more scene issues`, {
      tone: 'warn',
      kind: 'warning',
    });
  }
}

function isDirty(): boolean {
  return canonicalJson(currentDoc) !== loadedCanonical;
}

function sceneStatus(): string {
  const version = viewingVersion ?? loadedFrom?.version;
  const base = version === undefined ? currentDoc.name : `${currentDoc.name} (v${version})`;
  return `${base}${isDirty() ? ' \u00b7 unsaved changes' : ''}`;
}

function updateUrl(): void {
  const includeAnchor = loadedFrom === null && !readOnly;
  const search = serializeUrlState({
    ...(includeAnchor
      ? { anchorOverride: { latDeg: anchor.latDeg, lonDeg: anchor.lonDeg, headingDeg: anchor.headingDeg } }
      : {}),
    stack: activeStack,
    view: currentView,
    test: testEnabled,
    ...(loadedFrom === null ? {} : { scene: loadedFrom.sceneId }),
    ...(loadedFrom === null ? {} : { version: viewingVersion ?? loadedFrom.version }),
    ...(currentShareToken === undefined ? {} : { share: currentShareToken }),
    ...(urlState.api === undefined ? {} : { api: urlState.api }),
  });
  window.history.replaceState(null, '', `${window.location.pathname}?${search}`);
}

async function copyLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(window.location.href);
    notices.toast('Link copied');
  } catch {
    notices.toast('Could not copy link');
  }
}

const debugPanel = createDebugPanel(document.body, {
  onCopyLink: () => {
    void copyLink();
  },
});

function refreshDebugPanel(): void {
  debugPanel.set({
    anchor,
    heightSource,
    stack: activeStack,
    tileErrors,
    googleStatus,
    arcgisToken: arcgisTokenStatus,
    scene: sceneStatus(),
    api: apiStatus,
    access: accessLabel,
  });
}

// --- API helpers ----------------------------------------------------------------------------

async function refreshApiStatus(): Promise<void> {
  if (apiClient === null) {
    apiStatus = 'not configured';
    return;
  }
  const result = await apiClient.health();
  apiStatus = result.ok
    ? result.data.commit
      ? `up (commit ${result.data.commit.slice(0, 7)})`
      : 'up'
    : 'down';
}

async function connect(input: Session): Promise<{ ok: boolean; message: string }> {
  if (apiClient === null) {
    return { ok: false, message: 'No API configured' };
  }
  session = { accessKey: input.accessKey, author: input.author };
  sessionStore.save(session);
  connected = session.accessKey !== '';
  accessLabel = connected ? `connected as ${session.author === '' ? 'unknown' : session.author}` : 'not connected';

  const result = await apiClient.health();
  if (!result.ok) {
    apiStatus = 'down';
    refreshPersistence();
    return { ok: false, message: `${result.error.code}: ${result.error.message}` };
  }
  apiStatus = result.data.commit ? `up (commit ${result.data.commit.slice(0, 7)})` : 'up';
  refreshPersistence();
  return { ok: true, message: 'Connected' };
}

function signOut(): void {
  sessionStore.clear();
  session = { accessKey: '', author: '' };
  connected = false;
  accessLabel = 'not connected';
  refreshPersistence();
}

function clearSaveIssues(): void {
  notices.clearBannersByPrefix('save-issue');
}

function handleApiError(error: ApiError): void {
  if (error.code === 'UNAUTHORIZED') {
    sessionStore.clear();
    session = { accessKey: '', author: '' };
    connected = false;
    accessLabel = 'not connected';
    notices.showBanner('api-error', 'Not connected — the access key was rejected.', { tone: 'error' });
    refreshPersistence();
    return;
  }
  if (error.code === 'SCENE_INVALID' && Array.isArray(error.details)) {
    clearSaveIssues();
    const issues = error.details as Array<{ code: string; path: string; message: string }>;
    const shown = issues.slice(0, 5);
    shown.forEach((issue, index) => {
      notices.showBanner(`save-issue-${index}`, `${issue.code} at ${issue.path}: ${issue.message}`, {
        tone: 'error',
      });
    });
    if (issues.length > shown.length) {
      notices.showBanner('save-issue-more', `+${issues.length - shown.length} more issues`, { tone: 'error' });
    }
    return;
  }
  notices.showBanner('api-error', `${error.code}: ${error.message}`, { tone: 'error' });
}

function adoptSaved(sceneId: string, version: number, message: string): void {
  currentDoc = { ...currentDoc, id: sceneId };
  loadedCanonical = canonicalJson(currentDoc);
  loadedFrom = { sceneId, version };
  latestVersion = version;
  viewingVersion = null;
  readOnly = false;
  notices.clearBanner('conflict');
  persistenceUi.clearVersionBanner();
  notices.toast(message);
  rebuildScene();
  updateUrl();
}

async function save(): Promise<void> {
  if (apiClient === null || !connected || readOnly) {
    return;
  }
  clearSaveIssues();

  if (loadedFrom === null) {
    const result = await apiClient.createScene({ doc: currentDoc, name: currentDoc.name, message: 'create' });
    if (!result.ok) {
      handleApiError(result.error);
      return;
    }
    adoptSaved(result.data.sceneId, result.data.version, `Saved v${result.data.version}`);
    return;
  }

  const result = await apiClient.commitVersion(loadedFrom.sceneId, {
    doc: currentDoc,
    message: 'update',
    parentVersion: loadedFrom.version,
  });
  if (!result.ok) {
    if (result.error.code === 'VERSION_CONFLICT') {
      showConflict(result.error);
      return;
    }
    if (result.error.code === 'NO_CHANGE') {
      notices.toast('No changes to save');
      return;
    }
    handleApiError(result.error);
    return;
  }
  adoptSaved(loadedFrom.sceneId, result.data.version, `Saved v${result.data.version}`);
}

async function saveAsNew(name: string): Promise<void> {
  if (apiClient === null || !connected) {
    return;
  }
  clearSaveIssues();
  const doc: SceneDoc = { ...currentDoc, name };
  const result = await apiClient.createScene({ doc, name, message: 'create' });
  if (!result.ok) {
    handleApiError(result.error);
    return;
  }
  currentDoc = doc;
  adoptSaved(result.data.sceneId, result.data.version, `Saved v${result.data.version}`);
}

function applyDoc(detail: VersionDetail, opts: { readOnly: boolean; latest: number; viewing: number | null }): void {
  currentDoc = structuredClone(detail.doc);
  anchor = { ...currentDoc.site.anchor.value };
  heightSource = 'ellipsoid 0';
  loadedCanonical = canonicalJson(currentDoc);
  loadedFrom = { sceneId: detail.sceneId, version: detail.version };
  latestVersion = opts.latest;
  viewingVersion = opts.viewing;
  readOnly = opts.readOnly;
  history.clear(currentDoc);
  selected = null;
  rebuildScene();
  updateUrl();
}

async function reloadLatest(): Promise<void> {
  if (apiClient === null || loadedFrom === null) {
    return;
  }
  const result = await apiClient.getVersion(loadedFrom.sceneId, 'latest');
  if (!result.ok) {
    handleApiError(result.error);
    return;
  }
  notices.clearBanner('conflict');
  persistenceUi.clearVersionBanner();
  applyDoc(result.data, { readOnly: false, latest: result.data.version, viewing: null });
}

async function openScene(sceneId: string): Promise<void> {
  if (apiClient === null || !connected) {
    return;
  }
  const result = await apiClient.getVersion(sceneId, 'latest');
  if (!result.ok) {
    handleApiError(result.error);
    return;
  }
  notices.clearBanner('conflict');
  persistenceUi.clearVersionBanner();
  applyDoc(result.data, { readOnly: false, latest: result.data.version, viewing: null });
}

async function openVersion(version: number): Promise<void> {
  if (apiClient === null || loadedFrom === null) {
    return;
  }
  if (version === latestVersion) {
    await reloadLatest();
    return;
  }
  const sceneId = loadedFrom.sceneId;
  const [target, latest] = await Promise.all([
    apiClient.getVersion(sceneId, version),
    apiClient.getVersion(sceneId, 'latest'),
  ]);
  if (!target.ok) {
    handleApiError(target.error);
    return;
  }
  if (!latest.ok) {
    handleApiError(latest.error);
    return;
  }
  applyDoc(target.data, { readOnly: true, latest: latest.data.version, viewing: version });
  const summary = summariseDiff(diffScenes(latest.data.doc, target.data.doc));
  persistenceUi.showVersionBanner(version, latest.data.version, summary, () => {
    void makeLatest();
  });
}

async function makeLatest(): Promise<void> {
  if (apiClient === null || loadedFrom === null || viewingVersion === null) {
    return;
  }
  const message = `restore v${viewingVersion}`;
  const result = await apiClient.commitVersion(loadedFrom.sceneId, {
    doc: currentDoc,
    message,
    parentVersion: latestVersion ?? loadedFrom.version,
  });
  if (!result.ok) {
    if (result.error.code === 'VERSION_CONFLICT') {
      showConflict(result.error);
      return;
    }
    if (result.error.code === 'NO_CHANGE') {
      notices.toast('No changes to save');
      return;
    }
    handleApiError(result.error);
    return;
  }
  adoptSaved(loadedFrom.sceneId, result.data.version, `Saved v${result.data.version}`);
}

async function createShare(): Promise<string | null> {
  if (apiClient === null || loadedFrom === null) {
    return null;
  }
  const version = viewingVersion ?? loadedFrom.version;
  const result = await apiClient.createShare(loadedFrom.sceneId, { version, expiresInDays: 30 });
  if (!result.ok) {
    handleApiError(result.error);
    return null;
  }
  return result.data.url;
}

async function loadScenes(): Promise<SceneListItem[]> {
  if (apiClient === null || !connected) {
    return [];
  }
  const result = await apiClient.listScenes();
  if (!result.ok) {
    handleApiError(result.error);
    return [];
  }
  return result.data.scenes;
}

async function loadVersions(): Promise<VersionListItem[]> {
  if (apiClient === null || loadedFrom === null) {
    return [];
  }
  const result = await apiClient.listVersions(loadedFrom.sceneId);
  if (!result.ok) {
    handleApiError(result.error);
    return [];
  }
  return result.data;
}

function showConflict(error: ApiError): void {
  const details = (error.details ?? {}) as { latestVersion?: number };
  const latest = typeof details.latestVersion === 'number' ? details.latestVersion : (latestVersion ?? 0);
  persistenceUi.showConflict(latest, {
    reload: () => {
      void reloadLatest();
    },
    saveAsNew: () => {
      persistenceUi.openSaveAsNew();
    },
  });
}

async function loadShared(token: string): Promise<void> {
  if (apiClient === null) {
    return;
  }
  const result = await apiClient.getShare(token);
  if (!result.ok) {
    apiStatus = 'down';
    notices.showBanner('share-error', 'Shared scene not found or expired', { tone: 'error' });
    return;
  }
  apiStatus = 'up';
  currentDoc = structuredClone(result.data.doc);
  anchor = { ...currentDoc.site.anchor.value };
  heightSource = 'ellipsoid 0';
  loadedCanonical = canonicalJson(currentDoc);
  loadedFrom = null;
  latestVersion = null;
  viewingVersion = null;
  readOnly = true;
  history.clear(currentDoc);
  selected = null;
  notices.showBanner('shared-readonly', `Shared view — ${result.data.name}, v${result.data.version} (read-only)`, {
    tone: 'info',
  });
}

// --- Rendering ------------------------------------------------------------------------------

function rebuildScene(): void {
  viewer.entities.removeAll();
  renderScene(viewer, anchor, currentDoc, elementTypeRegistry, {
    onWarning: (message) => {
      notices.showBanner('ring-warning', message, { tone: 'warn' });
    },
    selected: selected?.id ?? null,
  });
  renderAxes(viewer, anchor);
  inspector.refresh();
  manipulation.refresh();
  refreshPersistence();
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

const mapStacks = createMapStacks(viewer, {
  googleKey,
  arcgisKey,
  maximumLevel: quality.maximumLevel,
  container: document.body,
  notices,
  onStackChange: handleStackChange,
  onTileError: () => {
    tileErrors += 1;
    refreshDebugPanel();
  },
  onGoogleStatus: (status) => {
    googleStatus = status;
    refreshDebugPanel();
  },
});

const persistenceUi = createPersistenceUi({
  notices,
  isConfigured: () => apiClient !== null,
  isConnected: () => connected,
  isReadOnly: () => readOnly,
  isDirty,
  hasScene: () => loadedFrom !== null,
  currentSceneName: () => currentDoc.name,
  onConnect: connect,
  onSignOut: signOut,
  onSave: save,
  onSaveAsNew: saveAsNew,
  onOpenScene: openScene,
  onOpenVersion: openVersion,
  onShare: createShare,
  loadScenes,
  loadVersions,
});

function setPlacementDocAnchor(next: SiteAnchor): void {
  currentDoc = {
    ...currentDoc,
    site: {
      ...currentDoc.site,
      anchor: { value: { ...next }, provenance: 'STATED' },
    },
  };
}

function setHeading(headingDeg: number): void {
  anchor = { ...anchor, headingDeg: normalizeHeading(headingDeg) };
  setPlacementDocAnchor(anchor);
  rebuildScene();
  updateUrl();
}

async function applyPlacement(latDeg: number, lonDeg: number, headingDeg: number): Promise<void> {
  anchor = { ...anchor, latDeg, lonDeg, headingDeg: normalizeHeading(headingDeg), heightM: 0 };
  heightSource = 'ellipsoid 0';

  if (mapStacks.getActive() === 'GOOGLE_3D') {
    const tileset = mapStacks.getTileset();
    if (tileset !== null) {
      const sampled = await sampleGroundHeight(viewer, tileset, anchor);
      if (sampled !== null) {
        anchor = { ...anchor, heightM: sampled };
        heightSource = 'sampled from Google 3D';
      }
    }
  }

  setPlacementDocAnchor(anchor);
  rebuildScene();
  updateUrl();
  placement.refresh();
}

function placeSite(latDeg: number, lonDeg: number, headingDeg: number): Promise<void> {
  return applyPlacement(latDeg, lonDeg, headingDeg);
}

const placement = createSitePlacement({
  viewer,
  notices,
  getAnchor: () => anchor,
  isGoogleActive: () => mapStacks.getActive() === 'GOOGLE_3D',
  onStart: () => {
    placementSnapshot = {
      anchor: { ...anchor },
      heightSource,
      docAnchor: currentDoc.site.anchor,
    };
  },
  onPick: (latDeg, lonDeg) => {
    void applyPlacement(latDeg, lonDeg, anchor.headingDeg);
  },
  onHeading: (headingDeg) => {
    setHeading(headingDeg);
  },
  onCancel: () => {
    if (placementSnapshot !== null) {
      anchor = { ...placementSnapshot.anchor };
      heightSource = placementSnapshot.heightSource;
      currentDoc = {
        ...currentDoc,
        site: { ...currentDoc.site, anchor: placementSnapshot.docAnchor },
      };
      placementSnapshot = null;
      rebuildScene();
      updateUrl();
    }
  },
});

let placementRef: SitePlacementController | null = placement;

function refreshPersistence(): void {
  persistenceUi.refresh();
  placementRef?.setDisabled(readOnly);
  refreshEditControls();
  refreshDebugPanel();
}

// --- Editing (Task 008). Every document change goes through @overlord/commands. ---

function selectionExists(): boolean {
  if (selected === null) {
    return false;
  }
  const id = selected.id;
  return selected.kind === 'element'
    ? currentDoc.elements.some((element) => element.id === id)
    : currentDoc.zones.some((zone) => zone.id === id);
}

function runCommand(command: Command): { ok: true } | { ok: false; message: string } {
  const result = history.run(command, applyCtx);
  if (!result.ok) {
    return { ok: false, message: `${result.error.code}: ${result.error.message}` };
  }
  currentDoc = history.current();
  if (!selectionExists()) {
    selected = null;
  }
  rebuildScene();
  return { ok: true };
}

function select(kind: 'element' | 'zone', id: string): void {
  selected = { kind, id };
  rebuildScene();
}

function clearSelection(): void {
  if (selected === null) {
    return;
  }
  selected = null;
  rebuildScene();
}

function deleteSelection(): void {
  if (selected === null) {
    return;
  }
  const command: Command =
    selected.kind === 'element'
      ? { type: 'DELETE_ELEMENT', id: selected.id }
      : { type: 'DELETE_ZONE', id: selected.id };
  const outcome = runCommand(command);
  if (!outcome.ok) {
    notices.showBanner('edit-error', outcome.message, { tone: 'error' });
  }
}

function undo(): void {
  if (!history.undo()) {
    return;
  }
  currentDoc = history.current();
  if (!selectionExists()) {
    selected = null;
  }
  rebuildScene();
}

function redo(): void {
  if (!history.redo()) {
    return;
  }
  currentDoc = history.current();
  if (!selectionExists()) {
    selected = null;
  }
  rebuildScene();
}

function setPending(typeCode: string | null): void {
  pendingType = typeCode;
  if (typeCode === null) {
    notices.clearBanner('add-hint');
    document.body.classList.remove('adding');
    return;
  }
  const definition = elementTypeRegistry.get(typeCode);
  document.body.classList.add('adding');
  notices.showBanner(
    'add-hint',
    `Click the ground to place ${definition?.name ?? typeCode} (Escape cancels)`,
    { tone: 'info' },
  );
}

function finishPendingAdd(local: LocalPoint): void {
  const typeCode = pendingType;
  if (typeCode === null) {
    return;
  }
  const before = new Set(currentDoc.elements.map((element) => element.id));
  const outcome = runCommand({
    type: 'ADD_ELEMENT',
    typeCode,
    center: {
      x: snapLengthTmm(local.x, SNAP_MODULE_10FT),
      y: snapLengthTmm(local.y, SNAP_MODULE_10FT),
      z: 0,
    } as never,
    provenance: 'STATED',
  });
  setPending(null);
  if (!outcome.ok) {
    notices.showBanner('edit-error', outcome.message, { tone: 'error' });
    return;
  }
  const added = currentDoc.elements.find((element) => !before.has(element.id));
  if (added !== undefined) {
    select('element', added.id);
  }
}

const inspector = createInspector({
  registry: elementTypeRegistry,
  getDoc: () => currentDoc,
  getSelection: () => selected,
  getUnit: () => displayUnit,
  onUnitChange: (unit) => {
    displayUnit = unit;
    inspector.refresh();
  },
  onCommand: (command) => runCommand(command),
  onDelete: () => deleteSelection(),
  onClose: () => clearSelection(),
});

const palette = createPalette({
  registry: elementTypeRegistry,
  onChoose: (typeCode) => setPending(typeCode),
});

const manipulation = createDirectManipulation({
  viewer,
  getAnchor: () => anchor,
  getSelection: () => selected,
  getElement: (id) => currentDoc.elements.find((element) => element.id === id) ?? null,
  onCommand: (command) => {
    const outcome = runCommand(command);
    if (!outcome.ok) {
      notices.showBanner('edit-error', outcome.message, { tone: 'error' });
    }
    return outcome;
  },
  isEnabled: () => !readOnly,
});

function barButton(label: string, action: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ui-button';
  button.dataset.action = action;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

const editBar = document.createElement('div');
editBar.className = 'edit-bar';
const addButton = barButton('Add', 'add', () => palette.open());
const undoButton = barButton('Undo', 'undo', undo);
const redoButton = barButton('Redo', 'redo', redo);
editBar.append(addButton, undoButton, redoButton);
persistenceUi.element.prepend(editBar);

function refreshEditControls(): void {
  undoButton.disabled = !history.canUndo();
  redoButton.disabled = !history.canRedo();
  addButton.disabled = readOnly;
}

// Ground clicks: place a pending add, select an entity, or clear the selection.
const clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
clickHandler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
  if (pendingType !== null) {
    const ground = pickGroundGeodetic(viewer, event.position, mapStacks.getActive() === 'GOOGLE_3D');
    if (ground === null) {
      return;
    }
    finishPendingAdd(geodeticToLocal(anchor, ground));
    return;
  }
  const pickedId = pickedEntityId(viewer.scene.pick(event.position));
  if (pickedId === null) {
    clearSelection();
    return;
  }
  if (currentDoc.elements.some((element) => element.id === pickedId)) {
    select('element', pickedId);
    return;
  }
  if (currentDoc.zones.some((zone) => zone.id === pickedId)) {
    select('zone', pickedId);
    return;
  }
  clearSelection();
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

window.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement | null;
  const typing = target !== null && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
  if (event.key === 'Escape') {
    if (pendingType !== null) {
      setPending(null);
    } else {
      clearSelection();
    }
    return;
  }
  if (typing) {
    return;
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    deleteSelection();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (event.shiftKey) {
      redo();
    } else {
      undo();
    }
  }
});

createViewpointButtons(document.body, (name) => {
  currentView = name;
  updateUrl();
  void flyToViewpoint(viewer, anchor, name);
});

// Defence in depth: if anything still throws inside the render loop, recover instead of stopping.
const restartTimes: number[] = [];
let lastRecoveryToastMs = 0;

viewer.scene.renderError.addEventListener((_scene: unknown, error: unknown) => {
  renderErrors += 1;
  console.error('Render error', error);

  const now = Date.now();
  while (restartTimes.length > 0 && now - (restartTimes[0] ?? 0) > 60_000) {
    restartTimes.shift();
  }

  if (restartTimes.length >= 3) {
    viewer.useDefaultRenderLoop = false;
    notices.showBanner('render-stopped', 'Rendering stopped — reload the page', {
      tone: 'error',
      actionLabel: 'Reload',
      onAction: () => {
        window.location.reload();
      },
    });
    return;
  }

  restartTimes.push(now);
  viewer.useDefaultRenderLoop = true;

  if (now - lastRecoveryToastMs > 5000) {
    lastRecoveryToastMs = now;
    notices.toast('Rendering recovered from an error', 'warn');
  }
});

function waitForNextFrame(): Promise<void> {
  return new Promise<void>((resolve) => {
    const remove = viewer.scene.postRender.addEventListener(() => {
      remove();
      resolve();
    });
  });
}

/**
 * Resolve true once the active imagery/3D tiles are loaded for three consecutive rendered frames,
 * or false on timeout. This is what the smoke tests wait on before taking screenshots.
 */
function waitForTilesLoaded(timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    let consecutive = 0;
    const handles: { timer?: number; remove?: () => void } = {};

    const settle = (loaded: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (handles.timer !== undefined) {
        window.clearTimeout(handles.timer);
      }
      handles.remove?.();
      resolve(loaded);
    };

    handles.remove = viewer.scene.postRender.addEventListener(() => {
      if (settled) {
        return;
      }
      const tileset = mapStacks.getTileset();
      const loaded = tileset !== null ? tileset.tilesLoaded : viewer.scene.globe.tilesLoaded;
      consecutive = loaded ? consecutive + 1 : 0;
      if (consecutive >= 3) {
        settle(true);
      }
    });

    handles.timer = window.setTimeout(() => {
      settle(false);
    }, timeoutMs);
  });
}

if (testEnabled) {
  window.__overlord = {
    get ready() {
      return ready;
    },
    get entityCount() {
      return viewer.entities.values.length;
    },
    get activeStack() {
      return activeStack;
    },
    get anchor() {
      return anchor;
    },
    get renderErrors() {
      return renderErrors;
    },
    get tileErrors() {
      return tileErrors;
    },
    get groundHeight() {
      return { heightM: anchor.heightM, source: heightSource };
    },
    get readOnly() {
      return readOnly;
    },
    get connected() {
      return connected;
    },
    get loadedFrom() {
      return loadedFrom;
    },
    flyTo: (name) => flyToViewpoint(viewer, anchor, name),
    setStack: (stack) => mapStacks.setActive(stack),
    waitForTilesLoaded: (timeoutMs) => waitForTilesLoaded(timeoutMs),
    placeSite: (latDeg, lonDeg, headingDeg) => placeSite(latDeg, lonDeg, headingDeg),
    runCommand: (command) => runCommand(command),
    undo: () => {
      undo();
      return history.canUndo();
    },
    redo: () => {
      redo();
      return history.canRedo();
    },
    selection: () => selected,
    docHash: () => canonicalJson(currentDoc),
    doc: () => currentDoc,
    elementCount: () => currentDoc.elements.length,
    element: (id) => currentDoc.elements.find((item) => item.id === id) ?? null,
    placePending: (x, y) => finishPendingAdd({ x, y, z: 0 } as never),
    select: (kind, id) => select(kind, id),
    clearSelection: () => clearSelection(),
  };
}

async function loadSceneFromUrl(): Promise<void> {
  if (apiClient === null || urlState.scene === undefined || !connected) {
    return;
  }
  const result = await apiClient.getVersion(urlState.scene, 'latest');
  if (!result.ok) {
    handleApiError(result.error);
    return;
  }
  applyDoc(result.data, { readOnly: false, latest: result.data.version, viewing: null });
  if (urlState.version !== undefined && urlState.version !== 'latest' && urlState.version !== result.data.version) {
    await openVersion(urlState.version);
  }
}

async function boot(): Promise<void> {
  await mapStacks.setActive(urlState.stack ?? 'ESRI');

  if (apiClient === null) {
    apiStatus = 'not configured';
  } else if (currentShareToken !== undefined) {
    await loadShared(currentShareToken);
  } else {
    await refreshApiStatus();
    await loadSceneFromUrl();
  }

  placementRef = placement;
  refreshPersistence();
  updateUrl();
  await flyToViewpoint(viewer, anchor, currentView);
  await waitForNextFrame();
  ready = true;
}

void boot().catch((error: unknown) => {
  console.error('Boot failed', error);
  ready = true;
});
