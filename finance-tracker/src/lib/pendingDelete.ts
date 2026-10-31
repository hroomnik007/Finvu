// Delete-with-undo, done as a *delayed* delete: the row is hidden at once and
// the DELETE request is only sent when the undo window closes.
//
// Why not "delete now, re-create on undo"? Re-creating gives the row a new id
// and loses server-side fields the client never sees (created_by, household
// sharing, created_at, series links), and an undo that fails half-way leaves
// the data changed. With a delayed delete, "Späť" simply cancels a request
// that never went out, and the worst failure (tab closed inside the window)
// keeps the row instead of losing it.

export const UNDO_WINDOW_MS = 5000

interface Pending { timer: ReturnType<typeof setTimeout>; commit: () => Promise<void>; onError?: (e: unknown) => void; started?: boolean }

const pending = new Map<string, Pending>()
const listeners = new Set<() => void>()
let snapshot: ReadonlySet<string> = new Set()

function emit() {
  snapshot = new Set(pending.keys())
  for (const l of listeners) l()
}

export function subscribePendingDeletes(l: () => void): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

/** Ids currently hidden while their delete waits for the undo window. */
export function getPendingDeletes(): ReadonlySet<string> { return snapshot }

async function run(id: string) {
  const p = pending.get(id)
  if (!p || p.started) return
  p.started = true
  clearTimeout(p.timer)
  try {
    await p.commit()
  } catch (e) {
    p.onError?.(e)
  } finally {
    // Removed only after the request settles, so a refetch that lands
    // mid-request can't flash the row back.
    if (pending.get(id) === p) pending.delete(id)
    emit()
  }
}

/**
 * Hide `id` now and run `commit` after `delay` ms unless undone.
 * Returns `undo`, which cancels the delete and shows the row again
 * (false when the delete already started).
 */
export function scheduleDelete(id: string, commit: () => Promise<void>, opts: { delay?: number; onError?: (e: unknown) => void } = {}): () => boolean {
  if (pending.has(id)) void run(id)
  const timer = setTimeout(() => { void run(id) }, opts.delay ?? UNDO_WINDOW_MS)
  const entry: Pending = { timer, commit, onError: opts.onError }
  pending.set(id, entry)
  emit()
  return () => {
    if (pending.get(id) !== entry || entry.started) return false
    clearTimeout(entry.timer)
    pending.delete(id)
    emit()
    return true
  }
}

/** Send every waiting delete now (page hide, logout). */
export function flushPendingDeletes(): Promise<void> {
  return Promise.all([...pending.keys()].map(run)).then(() => undefined)
}

/** Drop waiting deletes without sending them (test helper). */
export function resetPendingDeletes(): void {
  for (const p of pending.values()) clearTimeout(p.timer)
  pending.clear()
  emit()
}

// Leaving the page inside the undo window: send the deletes (best effort; if
// the browser drops the request the row simply stays — the safe direction).
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { void flushPendingDeletes() })
}
