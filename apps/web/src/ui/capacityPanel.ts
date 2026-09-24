/** Collapsed scene-level capacity panel, grouped AUDIENCE / HOSPITALITY / BACK_OF_HOUSE. */

import { sceneCapacity, type SceneDoc } from '@overlord/scene';

export interface CapacityPanel {
  element: HTMLElement;
  refresh(): void;
}

const GROUPS = ['AUDIENCE', 'HOSPITALITY', 'BACK_OF_HOUSE'] as const;
type Group = (typeof GROUPS)[number];

function groupFor(kind: string): Group {
  if (kind === 'AUDIENCE' || kind === 'PIT') {
    return 'AUDIENCE';
  }
  if (kind === 'HOSPITALITY' || kind === 'TABLES' || kind === 'VIP' || kind === 'SPONSOR') {
    return 'HOSPITALITY';
  }
  return 'BACK_OF_HOUSE';
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

    for (const group of GROUPS) {
      const rows = capacity.byZone.filter((row) => {
        const zone = getDoc().zones.find((candidate) => candidate.id === row.id);
        return groupFor(zone?.kind ?? 'OTHER') === group;
      });
      if (rows.length === 0) {
        continue;
      }
      const heading = document.createElement('div');
      heading.className = 'capacity-panel__group';
      heading.textContent = group;
      body.appendChild(heading);
      for (const row of rows) {
        const line = document.createElement('div');
        line.className = 'capacity-panel__row';
        line.dataset.zoneId = row.id;
        const label = document.createElement('span');
        label.textContent = row.label;
        const value = document.createElement('span');
        value.textContent = `${Math.round(row.areaSqFt).toLocaleString('en-US')} sq ft (${(row.areaSqFt * 0.09290304).toFixed(1)} m²) · ${row.density} sq ft/pax · ${row.pax.toLocaleString('en-US')} pax`;
        line.append(label, value);
        body.appendChild(line);
      }
    }

    const total = document.createElement('div');
    total.className = 'capacity-panel__total';
    total.textContent = `Total — ${capacity.totalPax.toLocaleString('en-US')} pax`;
    body.appendChild(total);
  }

  refresh();
  return { element: details, refresh };
}
