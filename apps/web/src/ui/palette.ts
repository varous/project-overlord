/** Element palette: the registry's types grouped by category, each with its default size in feet. */

import type { ElementTypeRegistry } from '@overlord/scene';

import { formatTrimmed } from './units.js';

export interface PaletteOptions {
  registry: ElementTypeRegistry;
  onChoose: (typeCode: string) => void;
}

export interface Palette {
  element: HTMLElement;
  open(): void;
  close(): void;
  isOpen(): boolean;
}

export function createPalette(options: PaletteOptions): Palette {
  const overlay = document.createElement('div');
  overlay.className = 'modal';
  overlay.dataset.modal = 'palette';
  overlay.hidden = true;

  const panel = document.createElement('div');
  panel.className = 'modal__panel';
  const header = document.createElement('div');
  header.className = 'modal__header';
  const title = document.createElement('h2');
  title.className = 'modal__title';
  title.textContent = 'Add element';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'modal__close';
  close.setAttribute('aria-label', 'Close palette');
  close.textContent = '\u00d7';
  header.append(title, close);

  const body = document.createElement('div');
  body.className = 'modal__body';
  panel.append(header, body);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const closeFn = (): void => {
    overlay.hidden = true;
  };
  close.addEventListener('click', closeFn);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeFn();
    }
  });

  function build(): void {
    body.replaceChildren();
    const byCategory = new Map<string, { code: string; name: string; x: number; y: number; z: number }[]>();
    for (const definition of options.registry.values()) {
      const list = byCategory.get(definition.category) ?? [];
      list.push({
        code: definition.code,
        name: definition.name,
        x: definition.defaultSize.x,
        y: definition.defaultSize.y,
        z: definition.defaultSize.z,
      });
      byCategory.set(definition.category, list);
    }

    for (const category of [...byCategory.keys()].sort()) {
      const heading = document.createElement('h3');
      heading.className = 'palette__category';
      heading.textContent = category;
      body.appendChild(heading);

      const items = (byCategory.get(category) ?? []).sort((a, b) => a.name.localeCompare(b.name));
      for (const item of items) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'modal__row palette__row';
        row.dataset.typeCode = item.code;
        const name = document.createElement('span');
        name.className = 'modal__row-title';
        name.textContent = item.name;
        const size = document.createElement('span');
        size.className = 'modal__row-meta';
        size.textContent = `${formatTrimmed(item.x as never, 'ft')} \u00d7 ${formatTrimmed(item.y as never, 'ft')} \u00d7 ${formatTrimmed(item.z as never, 'ft')}`;
        row.append(name, size);
        row.addEventListener('click', () => {
          closeFn();
          options.onChoose(item.code);
        });
        body.appendChild(row);
      }
    }
  }

  return {
    element: overlay,
    open: () => {
      build();
      overlay.hidden = false;
    },
    close: closeFn,
    isOpen: () => !overlay.hidden,
  };
}
