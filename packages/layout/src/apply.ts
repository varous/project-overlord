/**
 * Turn a generated layout into ONE command, so generating is a single undo step.
 */

import type { Command } from '@overlord/commands';
import type { SceneDoc } from '@overlord/scene';

import type { GenerateLayoutResult } from './engine.js';

/**
 * A REPLACE_CONTENT command carrying the generated elements and zones. Its inverse (built by
 * applyCommand) is the previous elements and zones, so undo restores the prior scene exactly.
 *
 * The `doc` argument is accepted so callers read naturally; the inverse is derived from the live
 * document when the command is applied.
 */
export function applyGeneratedLayout(
  doc: SceneDoc,
  generated: Extract<GenerateLayoutResult, { ok: true }>,
): Command {
  void doc;
  return {
    type: 'REPLACE_CONTENT',
    elements: generated.scene.elements,
    zones: generated.scene.zones,
  };
}
