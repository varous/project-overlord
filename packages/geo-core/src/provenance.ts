/**
 * Provenance tags every value in the platform.
 *
 * - `STATED`    — explicitly given by a human or an authoritative document.
 * - `ARCHETYPE` — taken from a known catalogue/template.
 * - `MEASURED`  — measured from a survey or sensor.
 * - `INFERRED`  — derived by a rule, heuristic or model.
 */
export type Provenance = 'STATED' | 'ARCHETYPE' | 'MEASURED' | 'INFERRED';

export interface Sourced<T> {
  value: T;
  provenance: Provenance;
  note?: string;
}

/** Wrap a value with its provenance and an optional note. */
export function sourced<T>(value: T, provenance: Provenance, note?: string): Sourced<T> {
  return note === undefined ? { value, provenance } : { value, provenance, note };
}
