/**
 * Interim access-key storage.
 *
 * !!! SECURITY — TEMPORARY MECHANISM !!!
 * The shared access key kept here is an interim mechanism only. It is replaced by Google Workspace
 * sign-in before any client-facing use, and it currently grants FULL WRITE ACCESS to every scene in
 * the API. Treat it like a password: it is never written to the URL, never logged, and never shown
 * in a notice or a screenshot.
 *
 * Reads and writes are wrapped in try/catch because private browsing can throw; if storage is
 * unavailable the values simply live in memory for the tab's lifetime.
 */

const ACCESS_KEY_STORAGE = 'overlord.accessKey';
const AUTHOR_STORAGE = 'overlord.author';

export interface Session {
  accessKey: string;
  author: string;
}

export interface SessionStore {
  get(): Session;
  save(session: Session): void;
  clear(): void;
}

function resolveStorage(explicit?: Storage): Storage | undefined {
  if (explicit !== undefined) {
    return explicit;
  }
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function safeRead(storage: Storage | undefined, key: string): string | null {
  if (storage === undefined) {
    return null;
  }
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(storage: Storage | undefined, key: string, value: string): void {
  if (storage === undefined) {
    return;
  }
  try {
    storage.setItem(key, value);
  } catch {
    // Storage unavailable or full — the in-memory value still works for this tab.
  }
}

function safeRemove(storage: Storage | undefined, key: string): void {
  if (storage === undefined) {
    return;
  }
  try {
    storage.removeItem(key);
  } catch {
    // ignore
  }
}

export function createSessionStore(storage?: Storage): SessionStore {
  let memory: Session = { accessKey: '', author: '' };

  return {
    get(): Session {
      const store = resolveStorage(storage);
      const accessKey = safeRead(store, ACCESS_KEY_STORAGE);
      const author = safeRead(store, AUTHOR_STORAGE);
      if (accessKey === null && author === null) {
        return { ...memory };
      }
      memory = {
        accessKey: accessKey ?? memory.accessKey,
        author: author ?? memory.author,
      };
      return { ...memory };
    },

    save(session: Session): void {
      memory = { ...session };
      const store = resolveStorage(storage);
      safeWrite(store, ACCESS_KEY_STORAGE, session.accessKey);
      safeWrite(store, AUTHOR_STORAGE, session.author);
    },

    clear(): void {
      memory = { accessKey: '', author: '' };
      const store = resolveStorage(storage);
      safeRemove(store, ACCESS_KEY_STORAGE);
      safeRemove(store, AUTHOR_STORAGE);
    },
  };
}
