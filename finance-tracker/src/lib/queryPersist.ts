// Keeps the last successful query results on the device (IndexedDB, per
// user), so a start without a connection still shows the latest data.
import { dehydrate, hydrate, type DehydratedState, type QueryClient } from '@tanstack/react-query'
import { kvDelPrefix, kvGet, kvSet } from './kvStore'

const PREFIX = 'rq_cache_'
export const PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const THROTTLE_MS = 1000
/** Bump when cached data shapes change so old snapshots are dropped. */
export const PERSIST_BUSTER = 'v1'

interface Snapshot { buster: string; savedAt: number; state: DehydratedState }

export function isUsableSnapshot(s: unknown, now = Date.now()): s is Snapshot {
  const v = s as Snapshot | null
  return !!v && typeof v === 'object' && v.buster === PERSIST_BUSTER && typeof v.savedAt === 'number'
    && now - v.savedAt < PERSIST_MAX_AGE_MS && !!v.state && Array.isArray(v.state.queries)
}

/** Restores the user's snapshot, then saves changes (throttled). Returns a stop function. */
export function startQueryPersistence(client: QueryClient, userId: string): () => void {
  const key = PREFIX + userId
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null

  void kvGet<Snapshot>(key).then(s => {
    if (stopped || !isUsableSnapshot(s)) return
    // hydrate() keeps any query that already has newer data.
    hydrate(client, s.state)
  })

  const save = () => {
    timer = null
    if (stopped) return
    const state = dehydrate(client, { shouldDehydrateQuery: q => q.state.status === 'success' && q.state.data !== undefined })
    void kvSet(key, { buster: PERSIST_BUSTER, savedAt: Date.now(), state } satisfies Snapshot)
  }
  const unsubscribe = client.getQueryCache().subscribe(e => {
    if (e.type !== 'updated' || e.action.type !== 'success') return
    if (!timer) timer = setTimeout(save, THROTTLE_MS)
  })

  return () => {
    stopped = true
    unsubscribe()
    if (timer) clearTimeout(timer)
  }
}

export function clearPersistedQueries(): Promise<void> {
  return kvDelPrefix(PREFIX)
}
