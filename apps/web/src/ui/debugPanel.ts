/**
 * Bottom-left debug panel: anchor, heading, active height and its source, map stack, build info.
 */

import type { SiteAnchor } from '@overlord/geo-core';

import type { MapStack } from '../viewer/mapStacks.js';

export interface DebugInfo {
  anchor: SiteAnchor;
  /** "ellipsoid 0" or "sampled from Google 3D". */
  heightSource: string;
  stack: MapStack;
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

export function createDebugPanel(container: HTMLElement): DebugPanel {
  const el = document.createElement('div');
  el.className = 'debug-panel';
  container.appendChild(el);

  const commit = import.meta.env.VITE_COMMIT_SHA ?? 'local';
  const branch = import.meta.env.VITE_BRANCH ?? 'local';

  return {
    set(info: DebugInfo): void {
      el.replaceChildren(
        row('Anchor', `${info.anchor.latDeg.toFixed(6)}, ${info.anchor.lonDeg.toFixed(6)}`),
        row('Heading', `${info.anchor.headingDeg}°`),
        row('Anchor height', `${info.anchor.heightM.toFixed(2)} m (${info.heightSource})`),
        row('Map stack', info.stack),
        row('Build', `${commit} @ ${branch}`),
      );
    },
  };
}
