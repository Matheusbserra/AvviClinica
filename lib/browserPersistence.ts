import { normalizeSnapshot, readSnapshot } from "./persistence";
import type { DataSnapshot, LocalSnapshot } from "./persistence";
const databaseName = "avvi-browser-copies-v1", storeName = "snapshots";
const indexedKeys = new Set<string>();
const queues = new Map<string, Promise<void>>();
let connection: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
  if (!connection) {
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      const request = window.indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName); };
      request.onerror = () => reject(request.error ?? new Error("Armazenamento local indisponível."));
      request.onblocked = () => reject(new Error("Armazenamento local bloqueado por outra janela."));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); connection = undefined; };
        resolve(db);
      };
    }).catch(error => { connection = undefined; throw error; });
  }
  return connection;
}
async function indexedCopy(key: string): Promise<LocalSnapshot | null> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly"), request = transaction.objectStore(storeName).get(key);
    transaction.onabort = () => reject(transaction.error ?? new Error("Leitura local interrompida."));
    transaction.onerror = () => reject(transaction.error ?? new Error("Falha na leitura local."));
    transaction.oncomplete = () => {
      const parsed = request.result;
      if (!parsed?.data || typeof parsed.data !== "object" || Array.isArray(parsed.data)) { resolve(null); return; }
      resolve({ savedAt: String(parsed.savedAt ?? ""), data: normalizeSnapshot(parsed.data), ...(parsed.syncedData ? { syncedData: normalizeSnapshot(parsed.syncedData) } : {}) });
    };
  });
}
async function putIndexedCopy(key: string, copy: LocalSnapshot) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Gravação local interrompida."));
    transaction.onerror = () => reject(transaction.error ?? new Error("Falha na gravação local."));
    transaction.objectStore(storeName).put(copy, key);
  });
}
// Existing copies remain readable. Every account/revision keeps its own key.
export async function readBrowserSnapshot(key: string): Promise<LocalSnapshot | null> {
  let local: LocalSnapshot | null = null, indexed: LocalSnapshot | null = null;
  try { local = readSnapshot(window.localStorage, key); } catch { /* Try the other storage independently. */ }
  try { indexed = await indexedCopy(key); } catch { /* A blocked IndexedDB does not prevent reading an old local copy. */ }
  if (indexed && (!local || indexed.savedAt >= local.savedAt)) { indexedKeys.add(key); return indexed; }
  return local;
}
// Queue writes per account so an old transaction cannot replace a newer draft.
export function writeBrowserSnapshot(data: DataSnapshot, syncedData: DataSnapshot | null, key: string): Promise<void> {
  const copy: LocalSnapshot = { savedAt: new Date().toISOString(), data, ...(syncedData ? { syncedData } : {}) };
  // Capture both draft and acknowledged baseline before asynchronous work starts.
  const serialized = JSON.stringify(copy);
  const task = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(async () => {
    if (!indexedKeys.has(key)) {
      try { window.localStorage.setItem(key, serialized); return; } catch { /* Quota/privacy restrictions: use IndexedDB. */ }
    }
    await putIndexedCopy(key, JSON.parse(serialized));
    indexedKeys.add(key);
    // Remove only the duplicate of this key, and only after the replacement commits.
    try { window.localStorage.removeItem(key); } catch { /* The committed copy is already durable. */ }
  });
  queues.set(key, task);
  return task;
}
