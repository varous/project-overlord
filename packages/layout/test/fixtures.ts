import { canonicalJson, elementTypeRegistry, type SceneElement } from '@overlord/scene';

import { generateLayout, type BriefInput, type GenerateLayoutResult } from '../src/index.js';

export const SITE_ANCHOR = { latDeg: 22.5579, lonDeg: 88.3439, heightM: 0, headingDeg: 0 };

export function generate(brief: BriefInput, archetypeId?: string): GenerateLayoutResult {
  return generateLayout({
    brief,
    registry: elementTypeRegistry,
    siteAnchor: SITE_ANCHOR,
    ...(archetypeId === undefined ? {} : { archetypeId }),
  });
}

export function generateOk(
  brief: BriefInput,
  archetypeId?: string,
): Extract<GenerateLayoutResult, { ok: true }> {
  const result = generate(brief, archetypeId);
  if (!result.ok) {
    throw new Error(`layout invalid: ${JSON.stringify(result.issues)}`);
  }
  return result;
}

export function elementById(elements: readonly SceneElement[], id: string): SceneElement {
  const found = elements.find((element) => element.id === id);
  if (found === undefined) {
    throw new Error(`missing element ${id}`);
  }
  return found;
}

export function yFeet(element: SceneElement): number {
  return element.placement.value.center.y / 3048;
}

export { canonicalJson, elementTypeRegistry };
