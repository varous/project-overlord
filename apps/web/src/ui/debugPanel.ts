/**
 * Bottom-left debug panel: anchor, heading, active height and its source, map stack, tile errors,
 * build info, and a Copy link button.
 */

import type { SiteAnchor } from '@overlord/geo-core';

import type { MapStack } from '../viewer/mapStacks.js';

export interface DebugInfo {
  anchor: SiteAnchor;
  /** "ellipsoid 0" or "sampled from Google 3D". */
  heightSource: string;
  stack: MapStack;
  tileErrors: number;
  /** Google 3D status: "active", "not active" or a short failure reason. */
  googleStatus: string;
  /** "own key" or "Cesium default (dev only)". */
  arcgisToken: string;
}

export interface DebugPanelOptions {
  onCopyLink: () => void;
}

export interface DebugPanel {
  set(info: DebugInfo): void;
}

function row(label: string, value: string): HTMLElement {
  const div = document.createElement('div');
  div.className = 'debug-panel__row';
  const labelEl = document.createElement('span');
  labelEl.className = 'debug-panel__label';
  labelEl.textContent = `${label}: `;
  const valueEl = document.createElement('span');
  valueEl.textContent = value;
  div.append(labelEl, valueEl);
  return div;
}

export function createDebugPanel(container: HTMLElement, options: DebugPanelOptions): DebugPanel {
  const el = document.createElement('div');
  el.className = 'debug-panel';
  container.appendChild(el);

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'debug-panel__button';
  copyButton.textContent = 'Copy link';
  copyButton.addEventListener('click', () => {
    options.onCopyLink();
  });

  const commit = import.meta.env.VITE_COMMIT_SHA ?? 'local';
  const branch = import.meta.env.VITE_BRANCH ?? 'local';

  return {
    set(info: DebugInfo): void {
      el.replaceChildren(
        row('Anchor', `${info.anchor.latDeg.toFixed(6)}, ${info.anchor.lonDeg.toFixed(6)}`),
        row('Heading', `${info.anchor.headingDeg}°`),
        row('Anchor height', `${info.anchor.heightM.toFixed(2)} m (${info.heightSource})`),
        row('Map stack', info.stack),
        row('Tile errors', String(info.tileErrors)),
        row('Google 3D', info.googleStatus),
        row('Esri token', info.arcgisToken),
        row('Build', `${commit} @ ${branch}`),
        copyButton,
      );
    },
  };
}
