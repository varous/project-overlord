/**
 * Right-hand Inspector: shows the selected element or zone and issues edit commands through the
 * host. It never mutates a scene document itself; every edit goes back as a Command.
 */

import type { ElementTypeRegistry, SceneDoc, SceneElement, SceneZone } from '@overlord/scene';

import type { Command } from '@overlord/commands';

import { formatBoth, parseValue, type DisplayUnit } from './units.js';

export interface Selection {
  kind: 'element' | 'zone';
  id: string;
}

export type CommandOutcome = { ok: true } | { ok: false; message: string };

export interface InspectorOptions {
  registry: ElementTypeRegistry;
  getDoc: () => SceneDoc;
  getSelection: () => Selection | null;
  getUnit: () => DisplayUnit;
  onUnitChange: (unit: DisplayUnit) => void;
  onCommand: (command: Command) => CommandOutcome;
  onDelete: () => void;
  onClose: () => void;
}

export interface Inspector {
  element: HTMLElement;
  refresh(): void;
}

export function createInspector(options: InspectorOptions): Inspector {
  const el = document.createElement('aside');
  el.className = 'inspector';
  el.hidden = true;

  const header = document.createElement('div');
  header.className = 'inspector__header';
  const title = document.createElement('h2');
  title.className = 'inspector__title';
  title.textContent = 'Inspector';
  const unitToggle = document.createElement('div');
  unitToggle.className = 'inspector__units';
  const ftButton = document.createElement('button');
  ftButton.type = 'button';
  ftButton.textContent = 'ft';
  ftButton.dataset.unit = 'ft';
  const mButton = document.createElement('button');
  mButton.type = 'button';
  mButton.textContent = 'm';
  mButton.dataset.unit = 'm';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'inspector__close';
  closeButton.setAttribute('aria-label', 'Close inspector');
  closeButton.textContent = '\u00d7';
  unitToggle.append(ftButton, mButton);
  header.append(title, unitToggle, closeButton);

  const body = document.createElement('div');
  body.className = 'inspector__body';
  const status = document.createElement('p');
  status.className = 'inspector__status';
  status.hidden = true;

  el.append(header, body, status);
  document.body.appendChild(el);

  ftButton.addEventListener('click', () => options.onUnitChange('ft'));
  mButton.addEventListener('click', () => options.onUnitChange('m'));
  closeButton.addEventListener('click', () => options.onClose());

  function setStatus(message: string | null): void {
    if (message === null || message === '') {
      status.hidden = true;
      status.textContent = '';
    } else {
      status.hidden = false;
      status.textContent = message;
    }
  }

  function provenanceBadge(provenance: string): HTMLElement {
    const badge = document.createElement('span');
    badge.className = 'inspector__provenance';
    badge.dataset.provenance = provenance;
    badge.textContent = provenance;
    return badge;
  }

  function row(label: string, control: HTMLElement, provenance?: string): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'inspector__row';
    const labelEl = document.createElement('span');
    labelEl.className = 'inspector__label';
    labelEl.textContent = label;
    wrapper.append(labelEl, control);
    if (provenance !== undefined) {
      wrapper.append(provenanceBadge(provenance));
    }
    return wrapper;
  }

  function lengthRow(label: string, value: number, unit: DisplayUnit, provenance: string, onChange: (next: number) => void): HTMLElement {
    const control = document.createElement('div');
    control.className = 'inspector__control';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'inspector__input';
    input.dataset.field = label.toLowerCase().replace(/\s+/g, '-');
    input.value = String(value / (unit === 'ft' ? 3048 : 10000));
    input.setAttribute('aria-label', `${label} in ${unit}`);
    const alt = document.createElement('span');
    alt.className = 'inspector__alt';
    alt.textContent = formatBoth(value as never, unit);
    input.addEventListener('change', () => {
      const parsed = parseValue(input.value, unit);
      if (parsed === null) {
        setStatus(`Enter ${label.toLowerCase()} as a length in ${unit}.`);
        refresh();
        return;
      }
      setStatus(null);
      onChange(parsed);
      refresh();
    });
    control.append(input, alt);
    return row(label, control, provenance);
  }

  function numberRow(label: string, value: number, suffix: string, provenance: string | undefined, onChange: (next: number) => void): HTMLElement {
    const control = document.createElement('div');
    control.className = 'inspector__control';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'inspector__input';
    input.dataset.field = label.toLowerCase();
    input.value = String(value);
    input.setAttribute('aria-label', label);
    const alt = document.createElement('span');
    alt.className = 'inspector__alt';
    alt.textContent = suffix;
    input.addEventListener('change', () => {
      const parsed = Number(input.value);
      if (!Number.isFinite(parsed)) {
        setStatus(`Enter ${label.toLowerCase()} as a number.`);
        refresh();
        return;
      }
      setStatus(null);
      onChange(parsed);
      refresh();
    });
    control.append(input, alt);
    return row(label, control, provenance);
  }

  function textRow(label: string, value: string, onCommit?: (next: string) => void): HTMLElement {
    const control = document.createElement('div');
    control.className = 'inspector__control';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'inspector__input';
    input.dataset.field = label.toLowerCase();
    input.value = value;
    input.setAttribute('aria-label', label);
    if (onCommit === undefined) {
      input.readOnly = true;
    } else {
      input.addEventListener('change', () => {
        setStatus(null);
        onCommit(input.value);
        refresh();
      });
    }
    control.append(input);
    return row(label, control);
  }

  function commit(command: Command): void {
    const outcome = options.onCommand(command);
    if (!outcome.ok) {
      setStatus(outcome.message);
    } else {
      setStatus(null);
    }
    refresh();
  }

  function renderElement(element: SceneElement): void {
    const unit = options.getUnit();
    const definition = options.registry.get(element.typeCode);
    body.replaceChildren();

    body.append(
      textRow('Type', `${definition?.name ?? element.typeCode} (${element.typeCode})`),
      textRow('Label', element.label, (label) => {
        commit({ type: 'SET_ELEMENT_LABEL', id: element.id, label });
      }),
      numberRow('Rotation', element.placement.value.rotationDeg, 'degrees', element.placement.provenance, (rotationDeg) => {
        commit({ type: 'ROTATE_ELEMENT', id: element.id, rotationDeg });
      }),
      lengthRow('Position X', element.placement.value.center.x, unit, element.placement.provenance, (x) => {
        commit({
          type: 'MOVE_ELEMENT_ABSOLUTE',
          id: element.id,
          center: { ...element.placement.value.center, x } as never,
        });
      }),
      lengthRow('Position Y', element.placement.value.center.y, unit, element.placement.provenance, (y) => {
        commit({
          type: 'MOVE_ELEMENT_ABSOLUTE',
          id: element.id,
          center: { ...element.placement.value.center, y } as never,
        });
      }),
    );

    if (definition?.geometry !== 'FLAT') {
      body.append(
        lengthRow('Size X', element.size.value.x, unit, element.size.provenance, (x) => {
          commit({ type: 'RESIZE_ELEMENT', id: element.id, size: { ...element.size.value, x } as never });
        }),
        lengthRow('Size Y', element.size.value.y, unit, element.size.provenance, (y) => {
          commit({ type: 'RESIZE_ELEMENT', id: element.id, size: { ...element.size.value, y } as never });
        }),
        lengthRow('Size Z', element.size.value.z, unit, element.size.provenance, (z) => {
          commit({ type: 'RESIZE_ELEMENT', id: element.id, size: { ...element.size.value, z } as never });
        }),
      );
    }

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'inspector__delete';
    deleteButton.dataset.action = 'delete-element';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => options.onDelete());
    body.append(deleteButton);
  }

  function renderZone(zoneItem: SceneZone): void {
    body.replaceChildren();
    body.append(
      textRow('Type', `Zone (${zoneItem.kind})`),
      textRow('Label', zoneItem.label),
      textRow('Vertices', `${zoneItem.ring.value.length} points`),
    );
    const provenanceRow = row('Ring', (() => {
      const span = document.createElement('span');
      span.className = 'inspector__alt';
      span.textContent = 'counter-clockwise';
      return span;
    })(), zoneItem.ring.provenance);
    body.append(provenanceRow);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'inspector__delete';
    deleteButton.dataset.action = 'delete-zone';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => options.onDelete());
    body.append(deleteButton);
  }

  function refresh(): void {
    const selection = options.getSelection();
    el.hidden = selection === null;
    if (selection === null) {
      setStatus(null);
      return;
    }
    const doc = options.getDoc();
    ftButton.classList.toggle('active', options.getUnit() === 'ft');
    mButton.classList.toggle('active', options.getUnit() === 'm');

    if (selection.kind === 'element') {
      const element = doc.elements.find((candidate) => candidate.id === selection.id);
      if (element === undefined) {
        el.hidden = true;
        return;
      }
      renderElement(element);
    } else {
      const zoneItem = doc.zones.find((candidate) => candidate.id === selection.id);
      if (zoneItem === undefined) {
        el.hidden = true;
        return;
      }
      renderZone(zoneItem);
    }
  }

  return { element: el, refresh };
}
