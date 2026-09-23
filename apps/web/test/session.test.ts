import { describe, expect, it } from 'vitest';

import { createSessionStore } from '../src/api/session.js';

class FakeStorage implements Storage {
  private readonly map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

class ThrowingStorage implements Storage {
  get length(): number {
    return 0;
  }
  clear(): void {
    throw new Error('blocked');
  }
  getItem(): string | null {
    throw new Error('blocked');
  }
  key(): string | null {
    throw new Error('blocked');
  }
  removeItem(): void {
    throw new Error('blocked');
  }
  setItem(): void {
    throw new Error('blocked');
  }
}

describe('createSessionStore', () => {
  it('saves and reads back through the injected storage', () => {
    const storage = new FakeStorage();
    const store = createSessionStore(storage);
    store.save({ accessKey: 'k-123', author: 'Ada' });
    expect(storage.getItem('overlord.accessKey')).toBe('k-123');
    expect(storage.getItem('overlord.author')).toBe('Ada');
    expect(store.get()).toEqual({ accessKey: 'k-123', author: 'Ada' });
  });

  it('reads pre-existing values from storage', () => {
    const storage = new FakeStorage();
    storage.setItem('overlord.accessKey', 'preset');
    storage.setItem('overlord.author', 'Grace');
    expect(createSessionStore(storage).get()).toEqual({ accessKey: 'preset', author: 'Grace' });
  });

  it('falls back to in-memory values when storage throws (private browsing)', () => {
    const store = createSessionStore(new ThrowingStorage());
    expect(() => store.save({ accessKey: 'k', author: 'Ada' })).not.toThrow();
    expect(store.get()).toEqual({ accessKey: 'k', author: 'Ada' });
    expect(() => store.clear()).not.toThrow();
    expect(store.get()).toEqual({ accessKey: '', author: '' });
  });

  it('clears both keys', () => {
    const storage = new FakeStorage();
    const store = createSessionStore(storage);
    store.save({ accessKey: 'k', author: 'Ada' });
    store.clear();
    expect(storage.getItem('overlord.accessKey')).toBeNull();
    expect(storage.getItem('overlord.author')).toBeNull();
    expect(store.get()).toEqual({ accessKey: '', author: '' });
  });
});
