/** Element palette: registry types grouped by category, with search over names and aliases. */

import type { ElementSizeDef, ElementTypeDef, ElementTypeRegistry } from '@overlord/scene';

import { formatTrimmed } from './units.js';

export interface PaletteOptions {
  registry: ElementTypeRegistry;
  /** Called with the chosen type and (for BOX/FLAT) the selected preset size. */
  onChoose: (typeCode: string, presetSize: ElementSizeDef | null) => void;
}

export interface Palette {
  element: HTMLElement;
  open(): void;
  close(): void;
  isOpen(): boolean;
}

function sizeLabel(size: ElementSizeDef): string {
  return `${formatTrimmed(size.x, 'ft')} × ${formatTrimmed(size.y, 'ft')} × ${formatTrimmed(size.z, 'ft')}`;
}

function matches(definition: ElementTypeDef, query: string): boolean {
  if (query === '') {
    return true;
  }
  return (
    definition.code.toLowerCase().includes(query) ||
    definition.name.toLowerCase().includes(query) ||
    definition.aliases.some((alias) => alias.includes(query))
  );
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
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'modal__close';
  closeButton.setAttribute('aria-label', 'Close palette');
  closeButton.textContent = '\u00d7';
  header.append(title, closeButton);

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'palette__search';
  search.setAttribute('aria-label', 'Search elements');
  search.placeholder = 'Search name or alias (e.g. mojo, metal detector)';

  const body = document.createElement('div');
  body.className = 'modal__body';
  panel.append(header, search, body);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const presetChoice = new Map<string, number>();

  const close = (): void => {
    overlay.hidden = true;
  };
  closeButton.addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      close();
    }
  });
  search.addEventListener('input', () => {
    render();
  });

  function render(): void {
    const query = search.value.trim().toLowerCase();
    body.replaceChildren();
    const byCategory = new Map<string, ElementTypeDef[]>();
    for (const definition of options.registry.values()) {
      if (!matches(definition, query)) {
        continue;
      }
      const list = byCategory.get(definition.category) ?? [];
      list.push(definition);
      byCategory.set(definition.category, list);
    }
    if (byCategory.size === 0) {
      const empty = document.createElement('p');
      empty.className = 'modal__message';
      empty.textContent = 'No matching elements.';
      body.appendChild(empty);
      return;
    }

    for (const category of [...byCategory.keys()].sort()) {
      const heading = document.createElement('h3');
      heading.className = 'palette__category';
      heading.textContent = category;
      body.appendChild(heading);

      const items = (byCategory.get(category) ?? []).sort((a, b) => a.name.localeCompare(b.name));
      for (const definition of items) {
        const row = document.createElement('div');
        row.className = 'palette__row';
        row.dataset.typeCode = definition.code;

        const choose = document.createElement('button');
        choose.type = 'button';
        choose.className = 'palette__choose';
        choose.dataset.action = 'palette-choose';
        const name = document.createElement('span');
        name.className = 'modal__row-title';
        name.textContent = definition.name;
        const size = document.createElement('span');
        size.className = 'modal__row-meta';
        if (definition.geometry === 'LINEAR') {
          const segment = definition.linear?.segmentLength ?? 0;
          size.textContent = `linear · segment ${formatTrimmed(segment as never, 'ft')}`;
        } else {
          const index = presetChoice.get(definition.code) ?? 0;
          size.textContent = sizeLabel(definition.sizePresets[index]?.size ?? definition.defaultSize);
        }
        choose.append(name, size);
        choose.addEventListener('click', () => {
          if (definition.geometry === 'LINEAR') {
            close();
            options.onChoose(definition.code, null);
            return;
          }
          const index = presetChoice.get(definition.code) ?? 0;
          const preset = definition.sizePresets[index];
          close();
          options.onChoose(definition.code, preset?.size ?? definition.defaultSize);
        });
        row.appendChild(choose);

        if (definition.geometry !== 'LINEAR' && definition.sizePresets.length > 1) {
          const select = document.createElement('select');
          select.className = 'palette__preset';
          select.setAttribute('aria-label', `${definition.code} preset`);
          definition.sizePresets.forEach((preset, index) => {
            const option = document.createElement('option');
            option.value = String(index);
            option.textContent = preset.label;
            select.appendChild(option);
          });
          select.value = String(presetChoice.get(definition.code) ?? 0);
          select.addEventListener('change', () => {
            presetChoice.set(definition.code, Number(select.value));
            render();
          });
          row.appendChild(select);
        }

        body.appendChild(row);
      }
    }
  }

  return {
    element: overlay,
    open: () => {
      search.value = '';
      render();
      overlay.hidden = false;
      search.focus();
    },
    close,
    isOpen: () => !overlay.hidden,
  };
}
