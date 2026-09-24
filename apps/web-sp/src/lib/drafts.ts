/**
 * Local draft persistence.
 *
 * Why this exists at all, in slice 0 rather than "later": the primary use case
 * is a live client call, often on hotel wifi or a tether. Losing a layout in
 * front of a client is the single most damaging failure this product has.
 * See docs/06-stack-review.md finding #5.
 *
 * Deliberately a thin wrapper over IndexedDB with no library. It is 60 lines,
 * and a dependency here would be a dependency in the most failure-sensitive
 * path in the app.
 */

const DB_NAME = "showplan";
const DB_VERSION = 1;
const STORE = "drafts";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "layoutId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface Draft<T = unknown> {
  layoutId: string;
  savedAt: number;
  /** Monotonic counter so we can tell a stale draft from a newer server state. */
  revision: number;
  state: T;
}

export async function putDraft<T>(draft: Draft<T>): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(draft);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getDraft<T>(layoutId: string): Promise<Draft<T> | null> {
  const db = await open();
  const result = await new Promise<Draft<T> | null>((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(layoutId);
    req.onsuccess = () => resolve((req.result as Draft<T> | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

export async function deleteDraft(layoutId: string): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(layoutId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
