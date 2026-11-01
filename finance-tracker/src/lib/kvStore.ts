// A tiny promise key/value store on IndexedDB (the idb-keyval idea, without
// the dependency). Falls back to memory where IndexedDB is missing (tests,
// some private modes), so callers never have to care.

const DB_NAME = 'finvu'
const STORE = 'kv'

let dbPromise: Promise<IDBDatabase> | null = null
const memory = new Map<string, unknown>()

function hasIdb(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null
}

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE) }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    dbPromise.catch(() => { dbPromise = null })
  }
  return dbPromise
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const req = fn(tx.objectStore(STORE))
    tx.oncomplete = () => resolve(req.result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  if (!hasIdb()) return memory.get(key) as T | undefined
  try { return await run<T>('readonly', s => s.get(key) as IDBRequest<T>) } catch { return memory.get(key) as T | undefined }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  memory.set(key, value)
  if (!hasIdb()) return
  try { await run('readwrite', s => s.put(value, key)) } catch { /* memory copy kept */ }
}

export async function kvDel(key: string): Promise<void> {
  memory.delete(key)
  if (!hasIdb()) return
  try { await run('readwrite', s => s.delete(key)) } catch { /* ignore */ }
}

/** Deletes every key that starts with `prefix` (per-user data on logout). */
export async function kvDelPrefix(prefix: string): Promise<void> {
  for (const k of [...memory.keys()]) if (k.startsWith(prefix)) memory.delete(k)
  if (!hasIdb()) return
  try {
    const keys = await run<IDBValidKey[]>('readonly', s => s.getAllKeys())
    await Promise.all(keys.filter(k => typeof k === 'string' && k.startsWith(prefix)).map(k => run('readwrite', s => s.delete(k))))
  } catch { /* ignore */ }
}
