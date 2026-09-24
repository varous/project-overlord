/**
 * Demo scene, loaded from the versioned scene contract.
 *
 * PURE module for the document itself; the viewer derives everything else from it.
 */

import { isPlacedElement, type SceneDoc, type SceneElement } from '@overlord/scene';

import demoSceneJson from '../../../../contracts/scene/v3/examples/demo-scene.json' with { type: 'json' };
import type { Placeable } from './placement.js';

/** The demo scene exactly as it is published in contracts/scene/v3/examples/demo-scene.json. */
export const demoScene = demoSceneJson as unknown as SceneDoc;

/** The demo anchor (22.5389524, 88.4009058, heading 273) — placed on the live site by Sourav. */
export const DEMO_ANCHOR = demoScene.site.anchor.value;

/** The geometric inputs the placement math needs, taken from a scene element. */
export function elementPlaceable(element: SceneElement): Placeable {
  if (!isPlacedElement(element)) {
    throw new Error(`Element ${element.id} is not a placed element`);
  }
  return {
    center: element.placement.value.center,
    size: element.size.value,
    rotationDeg: element.placement.value.rotationDeg,
  };
}
