import raw from '../data/archetypes.json' with { type: 'json' };

import type { Archetype, EventType } from './types.js';

const ALL = (raw as unknown as { archetypes: Archetype[] }).archetypes;

export function allArchetypes(): readonly Archetype[] {
  return ALL;
}

export function loadArchetypes(): Map<EventType, Archetype> {
  const map = new Map<EventType, Archetype>();
  for (const archetype of ALL) {
    map.set(archetype.eventType, archetype);
  }
  return map;
}

export function findArchetypeById(id: string): Archetype | null {
  return ALL.find((archetype) => archetype.id === id) ?? null;
}
