/**
 * Undo/redo history. Pure data structure: no DOM, no Cesium. A new command clears the redo stack,
 * and the undo stack is capped at 100 entries (the oldest is dropped).
 */

import type { SceneDoc } from '@overlord/scene';

import { applyCommand, type ApplyContext, type ApplyResult } from './apply.js';
import type { Command } from './types.js';

export interface History {
  current(): SceneDoc;
  canUndo(): boolean;
  canRedo(): boolean;
  /** Apply and push. On failure the document is unchanged and the error is returned. */
  run(command: Command, ctx: ApplyContext): ApplyResult;
  undo(): boolean;
  redo(): boolean;
  clear(doc?: SceneDoc): void;
  /** Number of undo entries currently held. */
  depth(): number;
}

const MAX_DEPTH = 100;

export function createHistory(initial: SceneDoc): History {
  let doc = initial;
  const undoStack: Command[] = [];
  const redoStack: Command[] = [];
  let ctx: ApplyContext | null = null;

  return {
    current: () => doc,
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    depth: () => undoStack.length,

    run(command: Command, runCtx: ApplyContext): ApplyResult {
      ctx = runCtx;
      const result = applyCommand(doc, command, runCtx);
      if (!result.ok) {
        return result;
      }
      doc = result.doc;
      undoStack.push(result.inverse);
      if (undoStack.length > MAX_DEPTH) {
        undoStack.shift();
      }
      redoStack.length = 0;
      return result;
    },

    undo(): boolean {
      if (ctx === null) {
        return false;
      }
      const command = undoStack.pop();
      if (command === undefined) {
        return false;
      }
      const result = applyCommand(doc, command, ctx);
      if (!result.ok) {
        undoStack.push(command);
        return false;
      }
      doc = result.doc;
      redoStack.push(result.inverse);
      return true;
    },

    redo(): boolean {
      if (ctx === null) {
        return false;
      }
      const command = redoStack.pop();
      if (command === undefined) {
        return false;
      }
      const result = applyCommand(doc, command, ctx);
      if (!result.ok) {
        redoStack.push(command);
        return false;
      }
      doc = result.doc;
      undoStack.push(result.inverse);
      if (undoStack.length > MAX_DEPTH) {
        undoStack.shift();
      }
      return true;
    },

    clear(next?: SceneDoc): void {
      undoStack.length = 0;
      redoStack.length = 0;
      if (next !== undefined) {
        doc = next;
      }
    },
  };
}
