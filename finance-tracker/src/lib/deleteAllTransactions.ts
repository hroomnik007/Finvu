import { getTransactions, deleteTransaction } from '../api/transactions'
import type { ApiTransaction } from '../types'
import { FLUSH_BACKOFF_MS, classifySendError } from './offlineQueue'

// The nginx limit on the API is 30 requests/s with a burst of 100 per IP, so
// the delete must not fire hundreds of requests at once.
export const DELETE_BATCH = 20
const PAGE = 200 // the server's maximum page size
// Waits before re-trying a record that got 429 (or a transient server error)
const RETRY_DELAYS_MS = FLUSH_BACKOFF_MS.slice(0, 3)

export interface DeleteAllDeps {
  list: () => Promise<ApiTransaction[]>
  remove: (id: string) => Promise<void>
  wait: (ms: number) => Promise<void>
}

const defaultDeps: DeleteAllDeps = {
  list: async () => (await getTransactions({ limit: PAGE })).data,
  remove: deleteTransaction,
  wait: ms => new Promise(r => setTimeout(r, ms)),
}

export interface DeleteAllResult { deleted: number; failed: number }

async function removeWithRetry(id: string, deps: DeleteAllDeps): Promise<boolean> {
  for (let attempt = 0; ; attempt++) {
    try {
      await deps.remove(id)
      return true
    } catch (err) {
      const status = (err as { response?: { status?: number } } | null)?.response?.status
      if (status === 404) return true // already gone
      if (classifySendError(err) !== 'transient' || attempt >= RETRY_DELAYS_MS.length) return false
      await deps.wait(RETRY_DELAYS_MS[attempt])
    }
  }
}

/**
 * Deletes every transaction of the user: pages of 200, each page in batches of
 * at most DELETE_BATCH parallel requests. Stops when nothing is left or when a
 * whole page could not delete a single record (no endless loop). `failed` is
 * the number of records of the last page that stayed.
 * A failing `list` rejects.
 */
export async function deleteAllTransactions(deps: DeleteAllDeps = defaultDeps): Promise<DeleteAllResult> {
  let deleted = 0
  for (;;) {
    const rows = await deps.list()
    if (rows.length === 0) return { deleted, failed: 0 }
    let removed = 0
    for (let i = 0; i < rows.length; i += DELETE_BATCH) {
      const results = await Promise.allSettled(rows.slice(i, i + DELETE_BATCH).map(r => removeWithRetry(r.id, deps)))
      removed += results.filter(r => r.status === 'fulfilled' && r.value).length
    }
    deleted += removed
    if (removed === 0) return { deleted, failed: rows.length }
  }
}
