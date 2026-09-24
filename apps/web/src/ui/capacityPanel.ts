/** Collapsed scene-level capacity panel: every zone's area and pax, plus the total. */

import { sceneCapacity, type SceneDoc } from '@overlord/scene';

export interface CapacityPanel {
  element: HTMLElement;
  refresh(): void;
}

export function createCapacityPanel(getDoc: () => SceneDoc): CapacityPanel {
  const details = document.createElement('details');
  details.className = 'capacity-panel';
  const summary = document.createElement('summary');
  summary.className = 'capacity-panel__summary';
  const body = document.createElement('div');
  body.className = 'capacity-panel__body';
  details.append(summary, body);
  document.body.appendChild(details);

  function refresh(): void {
    const capacity = sceneCapacity(getDoc());
    summary.textContent = `Scene capacity — ${capacity.totalPax.toLocaleString('en-US')} pax`;
    body.replaceChildren();
    for (const row of capacity.byZone) {
      const line = document.createElement('div');
      line.className = 'capacity-panel__row';
      line.dataset.zoneId = row.id;
      const label = document.createElement('span');
      label.textContent = row.label;
      const value = document.createElement('span');
      value.textContent = `${Math.round(row.areaSqFt).toLocaleString('en-US')} sq ft · ${row.pax.toLocaleString('en-US')} pax @ ${row.density}`;
      line.append(label, value);
      body.appendChild(line);
    }
    const total = document.createElement('div');
    total.className = 'capacity-panel__total';
    total.textContent = `Total — ${capacity.totalPax.toLocaleString('en-US')} pax`;
    body.appendChild(total);
  }

  refresh();
  return { element: details, refresh };
}
