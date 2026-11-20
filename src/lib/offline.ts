/**
 * Offline viewing (spec §12: cache locally, support offline viewing; Supabase stays the source
 * of truth). Each module's last successful load is saved in IndexedDB, keyed by user. When a
 * load fails because the network is down, the saved copy is returned and an "offline" banner
 * is shown. Writes are NOT queued yet — they fail clearly — so nothing can silently overwrite
 * financial or academic records (queued writes need conflict detection first).
 */

const DB = 'nexus-offline';
const STORE = 'cache';
let userScope = 'anon';

export function setOfflineUser(userId: string | null) {
  userScope = userId ?? 'anon';
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no indexedDB'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// --- offline state, observable by the banner --------------------------------
let offlineSince: number | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
export function onOfflineChange(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function offlineState() {
  return offlineSince;
}

export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e);
  return /Failed to fetch|NetworkError|Load failed|network|fetch failed/i.test(msg);
}

/**
 * Run a loader; on success save a copy, on network failure return the saved copy.
 * Any other error (permissions, validation) is rethrown — never masked by stale data.
 */
export async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const k = `${userScope}:${key}`;
  try {
    const fresh = await load();
    void idb('readwrite', (s) => s.put({ at: Date.now(), value: fresh }, k)).catch(() => undefined);
    if (offlineSince !== null) {
      offlineSince = null;
      notify();
    }
    return fresh;
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    const saved = await idb<{ at: number; value: T } | undefined>('readonly', (s) => s.get(k)).catch(() => undefined);
    if (!saved) throw new Error("You're offline and this hasn't been loaded on this device yet.", { cause: e });
    offlineSince = offlineSince === null ? saved.at : Math.min(offlineSince, saved.at);
    notify();
    return saved.value;
  }
}

/** Remove everything cached on this device (sign-out). */
export async function clearOffline() {
  await idb('readwrite', (s) => s.clear()).catch(() => undefined);
}
