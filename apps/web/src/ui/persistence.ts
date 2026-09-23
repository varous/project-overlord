/**
 * Scene persistence UI: Connect, Save, Save as new, Open, Versions and Share.
 *
 * This module only builds DOM and calls back into the host (`main.ts`); it performs no API calls
 * itself and never sees the access key beyond passing it to `onConnect`. Controls stay visible but
 * disabled until the API is configured and the user is connected.
 */

import type { Session } from '../api/session.js';
import type { Notices } from './notices.js';
import { formatRelativeTime } from './relativeTime.js';

export interface SceneListItem {
  id: string;
  name: string;
  latestVersion: number;
  updatedAt: string;
}

export interface VersionListItem {
  version: number;
  author: string;
  message: string;
  createdAt: string;
}

export interface PersistenceUiOptions {
  notices: Notices;
  isConfigured: () => boolean;
  isConnected: () => boolean;
  isReadOnly: () => boolean;
  isDirty: () => boolean;
  hasScene: () => boolean;
  currentSceneName: () => string;
  onConnect: (session: Session) => Promise<{ ok: boolean; message: string }>;
  onSignOut: () => void;
  onSave: () => Promise<void>;
  onSaveAsNew: (name: string) => Promise<void>;
  onOpenScene: (id: string) => Promise<void>;
  onOpenVersion: (version: number) => Promise<void>;
  onShare: () => Promise<string | null>;
  loadScenes: () => Promise<SceneListItem[]>;
  loadVersions: () => Promise<VersionListItem[]>;
}

export interface PersistenceUi {
  element: HTMLElement;
  refresh(): void;
  showConflict(latestVersion: number, handlers: { reload: () => void; saveAsNew: () => void }): void;
  showVersionBanner(
    version: number,
    latestVersion: number,
    summary: string,
    onMakeLatest: () => void,
  ): void;
  clearVersionBanner(): void;
  openScenes(): Promise<void>;
  openVersions(): Promise<void>;
  openSaveAsNew(): void;
  closeAll(): void;
}

interface Modal {
  overlay: HTMLElement;
  body: HTMLElement;
  open: () => void;
  close: () => void;
}

function createModal(title: string): Modal {
  const overlay = document.createElement('div');
  overlay.className = 'modal';
  overlay.hidden = true;

  const panel = document.createElement('div');
  panel.className = 'modal__panel';

  const header = document.createElement('div');
  header.className = 'modal__header';
  const heading = document.createElement('h2');
  heading.className = 'modal__title';
  heading.textContent = title;
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'modal__close';
  closeButton.setAttribute('aria-label', `Close ${title}`);
  closeButton.textContent = '\u00d7';
  header.append(heading, closeButton);

  const body = document.createElement('div');
  body.className = 'modal__body';

  panel.append(header, body);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const close = (): void => {
    overlay.hidden = true;
  };
  closeButton.addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      close();
    }
  });

  return {
    overlay,
    body,
    open: () => {
      overlay.hidden = false;
    },
    close,
  };
}

function actionButton(label: string, action: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'ui-button';
  el.dataset.action = action;
  el.textContent = label;
  el.addEventListener('click', onClick);
  return el;
}

function messageRow(text: string): HTMLElement {
  const el = document.createElement('p');
  el.className = 'modal__message';
  el.textContent = text;
  return el;
}

function labelled(labelText: string, input: HTMLElement): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'modal__field';
  const span = document.createElement('span');
  span.textContent = labelText;
  label.append(span, input);
  return label;
}

export function createPersistenceUi(options: PersistenceUiOptions): PersistenceUi {
  const topBar = document.createElement('div');
  topBar.className = 'top-bar';

  const connectButton = actionButton('Connect', 'connect', () => openConnect());
  const saveButton = actionButton('Save', 'save', () => {
    void options.onSave();
  });
  const saveAsNewButton = actionButton('Save as new', 'save-as-new', () => openSaveAsNew());
  const openButton = actionButton('Open', 'open', () => {
    void openScenes();
  });
  const versionsButton = actionButton('Versions', 'versions', () => {
    void openVersions();
  });
  const shareButton = actionButton('Share', 'share', () => {
    void openShare();
  });

  topBar.append(connectButton, saveButton, saveAsNewButton, openButton, versionsButton, shareButton);
  document.body.appendChild(topBar);

  // --- Connect panel ------------------------------------------------------------------------
  const connectModal = createModal('Connect to the API');
  const keyInput = document.createElement('input');
  keyInput.type = 'password';
  keyInput.autocomplete = 'off';
  keyInput.setAttribute('aria-label', 'Access key');
  const authorInput = document.createElement('input');
  authorInput.type = 'text';
  authorInput.setAttribute('aria-label', 'Author name');
  const connectStatus = messageRow('');
  const saveKeyButton = actionButton('Save', 'connect-save', () => {
    void (async () => {
      const result = await options.onConnect({
        accessKey: keyInput.value.trim(),
        author: authorInput.value.trim(),
      });
      connectStatus.textContent = result.ok ? 'Connected' : result.message;
      if (result.ok) {
        keyInput.value = '';
        connectModal.close();
      }
    })();
  });
  const signOutButton = actionButton('Sign out', 'connect-signout', () => {
    options.onSignOut();
    connectStatus.textContent = 'Signed out';
    keyInput.value = '';
  });
  connectModal.body.append(
    labelled('Access key', keyInput),
    labelled('Author name', authorInput),
    connectStatus,
    saveKeyButton,
    signOutButton,
  );

  function openConnect(): void {
    connectStatus.textContent = options.isConnected() ? 'Connected' : '';
    keyInput.value = '';
    connectModal.open();
  }

  // --- Open dialog --------------------------------------------------------------------------
  const scenesModal = createModal('Open scene');
  async function openScenes(): Promise<void> {
    scenesModal.open();
    scenesModal.body.replaceChildren(messageRow('Loading…'));
    let scenes: SceneListItem[] = [];
    try {
      scenes = await options.loadScenes();
    } catch {
      scenes = [];
    }
    scenesModal.body.replaceChildren();
    if (scenes.length === 0) {
      scenesModal.body.append(messageRow('No scenes found.'));
      return;
    }
    for (const scene of scenes) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'modal__row';
      row.dataset.sceneId = scene.id;
      const title = document.createElement('span');
      title.className = 'modal__row-title';
      title.textContent = scene.name;
      const meta = document.createElement('span');
      meta.className = 'modal__row-meta';
      meta.textContent = `v${scene.latestVersion} · ${formatRelativeTime(scene.updatedAt)}`;
      row.append(title, meta);
      row.addEventListener('click', () => {
        scenesModal.close();
        void options.onOpenScene(scene.id);
      });
      scenesModal.body.appendChild(row);
    }
  }

  // --- Versions panel -----------------------------------------------------------------------
  const versionsModal = createModal('Version history');
  async function openVersions(): Promise<void> {
    versionsModal.open();
    versionsModal.body.replaceChildren(messageRow('Loading…'));
    let versions: VersionListItem[] = [];
    try {
      versions = await options.loadVersions();
    } catch {
      versions = [];
    }
    versionsModal.body.replaceChildren();
    if (versions.length === 0) {
      versionsModal.body.append(messageRow('No versions yet.'));
      return;
    }
    for (const version of versions) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'modal__row';
      row.dataset.version = String(version.version);
      const title = document.createElement('span');
      title.className = 'modal__row-title';
      title.textContent = version.message === '' ? `v${version.version}` : `v${version.version} · ${version.message}`;
      const meta = document.createElement('span');
      meta.className = 'modal__row-meta';
      meta.textContent = `${version.author} · ${formatRelativeTime(version.createdAt)}`;
      row.append(title, meta);
      row.addEventListener('click', () => {
        versionsModal.close();
        void options.onOpenVersion(version.version);
      });
      versionsModal.body.appendChild(row);
    }
  }

  // --- Save as new --------------------------------------------------------------------------
  const saveAsModal = createModal('Save as new scene');
  const newNameInput = document.createElement('input');
  newNameInput.type = 'text';
  newNameInput.setAttribute('aria-label', 'New scene name');
  const createButton = actionButton('Create', 'save-as-new-create', () => {
    const name = newNameInput.value.trim();
    saveAsModal.close();
    void options.onSaveAsNew(name === '' ? options.currentSceneName() : name);
  });
  saveAsModal.body.append(labelled('Scene name', newNameInput), createButton);

  function openSaveAsNew(): void {
    newNameInput.value = '';
    saveAsModal.open();
    newNameInput.focus();
  }

  // --- Share panel --------------------------------------------------------------------------
  const shareModal = createModal('Share scene');
  async function openShare(): Promise<void> {
    shareModal.open();
    shareModal.body.replaceChildren(messageRow('Creating link…'));
    const url = await options.onShare();
    shareModal.body.replaceChildren();
    if (url === null) {
      shareModal.body.append(messageRow('Could not create a share link.'));
      return;
    }
    const input = document.createElement('input');
    input.type = 'text';
    input.readOnly = true;
    input.className = 'modal__url';
    input.setAttribute('aria-label', 'Share URL');
    input.value = url;
    const copyButton = actionButton('Copy', 'copy-share', () => {
      void navigator.clipboard.writeText(url).then(
        () => options.notices.toast('Link copied'),
        () => options.notices.toast('Could not copy link'),
      );
    });
    shareModal.body.append(input, copyButton);
  }

  function refresh(): void {
    const configured = options.isConfigured();
    const connected = configured && options.isConnected();
    const readOnly = options.isReadOnly();
    const canEditRemotely = connected && !readOnly;

    saveButton.hidden = readOnly;
    saveAsNewButton.hidden = readOnly;
    versionsButton.hidden = readOnly;
    shareButton.hidden = readOnly;

    saveButton.disabled = !canEditRemotely || !options.isDirty();
    saveAsNewButton.disabled = !canEditRemotely;
    openButton.disabled = !canEditRemotely;
    versionsButton.disabled = !canEditRemotely || !options.hasScene();
    shareButton.disabled = !canEditRemotely || !options.hasScene();

    connectButton.textContent = connected ? 'Account' : 'Connect';

    const tip = !connected ? 'Connect to the API to save' : readOnly ? 'Shared view — read only' : '';
    for (const el of [saveButton, saveAsNewButton, openButton, versionsButton, shareButton]) {
      if (el.disabled && tip !== '') {
        el.title = tip;
      } else {
        el.removeAttribute('title');
      }
    }
  }

  function showConflict(
    latestVersion: number,
    handlers: { reload: () => void; saveAsNew: () => void },
  ): void {
    options.notices.showBanner(
      'conflict',
      `This scene changed elsewhere (now v${latestVersion}). Reload the latest version, or Save as new scene.`,
      {
        tone: 'warn',
        actions: [
          { label: 'Reload latest version', onClick: handlers.reload },
          { label: 'Save as new scene', onClick: handlers.saveAsNew },
        ],
      },
    );
  }

  function showVersionBanner(
    version: number,
    latestVersion: number,
    summary: string,
    onMakeLatest: () => void,
  ): void {
    options.notices.showBanner(
      'version',
      `Viewing v${version} of ${latestVersion} (read-only) · ${summary}`,
      { tone: 'info', actions: [{ label: 'Make this the latest', onClick: onMakeLatest }] },
    );
  }

  return {
    element: topBar,
    refresh,
    showConflict,
    showVersionBanner,
    clearVersionBanner: () => options.notices.clearBanner('version'),
    openScenes,
    openVersions,
    openSaveAsNew,
    closeAll: () => {
      connectModal.close();
      scenesModal.close();
      versionsModal.close();
      saveAsModal.close();
      shareModal.close();
    },
  };
}
