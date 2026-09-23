import { describe, expect, it } from 'vitest';

import { canonicalJson } from '@overlord/scene';

import { createHistory } from '../src/history.js';
import { makeCtx, makeScene } from './fixtures.js';

describe('createHistory', () => {
  it('runs, undoes and redoes with exact documents', () => {
    const original = makeScene();
    const ctx = makeCtx('h');
    const history = createHistory(original);

    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);

    const result = history.run({ type: 'SET_SCENE_NAME', name: 'A' }, ctx);
    expect(result.ok).toBe(true);
    expect(history.current().name).toBe('A');
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
    expect(history.depth()).toBe(1);

    expect(history.undo()).toBe(true);
    expect(canonicalJson(history.current())).toBe(canonicalJson(original));
    expect(history.canRedo()).toBe(true);

    expect(history.redo()).toBe(true);
    expect(history.current().name).toBe('A');
    expect(history.depth()).toBe(1);
  });

  it('clears the redo stack when a new command runs', () => {
    const history = createHistory(makeScene());
    const ctx = makeCtx('h');
    history.run({ type: 'SET_SCENE_NAME', name: 'A' }, ctx);
    history.undo();
    expect(history.canRedo()).toBe(true);
    history.run({ type: 'SET_SCENE_NAME', name: 'B' }, ctx);
    expect(history.canRedo()).toBe(false);
  });

  it('leaves the document unchanged when a command fails', () => {
    const history = createHistory(makeScene());
    const before = canonicalJson(history.current());
    const result = history.run({ type: 'DELETE_ELEMENT', id: 'nope' }, makeCtx('h'));
    expect(result.ok).toBe(false);
    expect(canonicalJson(history.current())).toBe(before);
    expect(history.canUndo()).toBe(false);
  });

  it('caps the undo stack at 100 entries', () => {
    const history = createHistory(makeScene());
    const ctx = makeCtx('h');
    for (let index = 0; index < 105; index += 1) {
      history.run({ type: 'SET_SCENE_NAME', name: `N${index}` }, ctx);
    }
    expect(history.depth()).toBe(100);
  });

  it('clear empties both stacks', () => {
    const history = createHistory(makeScene());
    const ctx = makeCtx('h');
    history.run({ type: 'SET_SCENE_NAME', name: 'A' }, ctx);
    history.undo();
    history.clear();
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
    expect(history.depth()).toBe(0);
  });

  it('undo and redo are no-ops when the stacks are empty', () => {
    const history = createHistory(makeScene());
    expect(history.undo()).toBe(false);
    expect(history.redo()).toBe(false);
  });
});
