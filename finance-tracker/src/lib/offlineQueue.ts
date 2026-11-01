// Offline queue for creates (expenses, incomes, fixed bills).
//
// A create that cannot reach the server is kept on the device (IndexedDB,
// one list per signed-in user) together with the Idempotency-Key it was
// first sent with. Every later attempt reuses that key, so a create whose
// answer was lost is never stored twice (backend/src/middleware/idempotency.ts).
// Items go out one by one in the order they were made; a network problem
// stops the run and retries later with backoff, while a rejection (4xx) parks
// the item as "failed" for the user to retry or discard.

import type { TransactionPayload } from '../api/transactions'
import { newIdempotencyKey } from '../api/idempotency'
import { kvDelPrefix, kvGet, kvSet } from './kvStore'

export const QUEUED_ID_PREFIX = 'queued:'
const STORAGE_PREFIX = 'offline_queue_'
export const FLUSH_BACKOFF_MS = [2000, 5000, 15000, 30000, 60000]

export interface QueuedError { status?: number; code?: string }

export interface QueuedCreate {
  /** Idempotency-Key, also the queue id. */
  key: string
  payload: TransactionPayload
  queuedAt: number
  attempts: number
  status: 'pending' | 'failed'
  error?: QueuedError
}

export type SendCreate = (payload: TransactionPayload, opts: { idempotencyKey: string }) => Promise<unknown>

let userId: string | null = null
let items: QueuedCreate[] = []
let loadSeq = 0
const listeners = new Set<() => void>()
let flushing: Promise<FlushResult> | null = null
let backoffTimer: ReturnType<typeof setTimeout> | null = null
let backoffStep = 0
let lastSend: SendCreate | null = null

function emit() { for (const l of listeners) l() }
function persist() { if (userId) void kvSet(STORAGE_PREFIX + userId, items) }
function setItems(next: QueuedCreate[]) { items = next; persist(); emit() }

export function subscribeQueue(l: () => void): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

/** Stable snapshot for useSyncExternalStore. */
export function getQueue(): readonly QueuedCreate[] { return items }

export function queuedId(key: string): string { return QUEUED_ID_PREFIX + key }
export function isQueuedId(id: string | undefined | null): boolean { return !!id && id.startsWith(QUEUED_ID_PREFIX) }

/** Loads the signed-in user's queue; null empties memory (the stored queue stays). */
export async function setQueueUser(id: string | null): Promise<void> {
  if (id === userId) return
  const seq = ++loadSeq
  userId = id
  items = []
  cancelBackoff()
  emit()
  if (!id) return
  const stored = await kvGet<QueuedCreate[]>(STORAGE_PREFIX + id)
  if (seq !== loadSeq) return
  // Anything added while loading goes after the stored items.
  items = [...(Array.isArray(stored) ? stored : []), ...items]
  emit()
}

export function enqueueCreate(payload: TransactionPayload, key: string = newIdempotencyKey(), now = Date.now()): QueuedCreate {
  if (!userId) throw new Error('offline queue: no signed-in user')
  const item: QueuedCreate = { key, payload, queuedAt: now, attempts: 0, status: 'pending' }
  setItems([...items, item])
  return item
}

/** Drops an item (discard, or undo of an offline add). False if it was already sent. */
export function removeQueued(idOrKey: string): boolean {
  const key = idOrKey.startsWith(QUEUED_ID_PREFIX) ? idOrKey.slice(QUEUED_ID_PREFIX.length) : idOrKey
  if (!items.some(i => i.key === key)) return false
  setItems(items.filter(i => i.key !== key))
  return true
}

export function hasPending(): boolean { return items.some(i => i.status === 'pending') }

/** 'offline': no answer at all; 'transient': try again later; 'rejected': the server said no. */
export function classifySendError(err: unknown): 'offline' | 'transient' | 'rejected' {
  const e = err as { response?: { status?: number; data?: { code?: unknown } }; code?: string } | null
  if (!e || typeof e !== 'object' || !e.response) return 'offline'
  const s = e.response.status ?? 0
  if (s >= 500 || s === 408 || s === 429 || s === 401) return 'transient'
  if (s === 409 && e.response.data?.code === 'IDEMPOTENCY_IN_PROGRESS') return 'transient'
  return 'rejected'
}

/** A create that should be queued instead of shown as an error. */
export function isOfflineError(err: unknown): boolean {
  const e = err as { code?: string } | null
  return !!e && e.code !== 'ERR_CANCELED' && classifySendError(err) === 'offline'
}

export interface FlushResult { sent: number; failed: number; stopped: boolean }

function cancelBackoff() {
  if (backoffTimer) clearTimeout(backoffTimer)
  backoffTimer = null
}

function scheduleBackoff() {
  cancelBackoff()
  const ms = FLUSH_BACKOFF_MS[Math.min(backoffStep, FLUSH_BACKOFF_MS.length - 1)]
  backoffStep++
  backoffTimer = setTimeout(() => { backoffTimer = null; if (lastSend) void flushQueue(lastSend) }, ms)
}

const flushedListeners = new Set<(r: FlushResult) => void>()
/** Called after a run that sent something (the app refetches its lists). */
export function onQueueFlushed(l: (r: FlushResult) => void): () => void {
  flushedListeners.add(l)
  return () => { flushedListeners.delete(l) }
}

/** Sends pending items in order. Concurrent calls share one run. */
export function flushQueue(send: SendCreate, online: () => boolean = defaultOnline): Promise<FlushResult> {
  lastSend = send
  if (flushing) return flushing
  flushing = (async () => {
    // Yield first: a run with nothing to send would otherwise reach the
    // `finally` below before `flushing` is assigned, leaving it stuck.
    await Promise.resolve()
    const result: FlushResult = { sent: 0, failed: 0, stopped: false }
    const owner = userId
    try {
      while (owner && owner === userId) {
        if (!online()) { result.stopped = true; break }
        const next = items.find(i => i.status === 'pending')
        if (!next) break
        try {
          await send(next.payload, { idempotencyKey: next.key })
          if (owner !== userId) break
          setItems(items.filter(i => i.key !== next.key))
          result.sent++
          backoffStep = 0
        } catch (err) {
          if (owner !== userId) break
          const kind = classifySendError(err)
          const r = (err as { response?: { status?: number; data?: { code?: unknown } } }).response
          if (kind === 'rejected') {
            setItems(items.map(i => i.key === next.key
              ? { ...i, attempts: i.attempts + 1, status: 'failed', error: { status: r?.status, code: typeof r?.data?.code === 'string' ? r.data.code : undefined } }
              : i))
            result.failed++
            continue
          }
          setItems(items.map(i => i.key === next.key ? { ...i, attempts: i.attempts + 1 } : i))
          result.stopped = true
          scheduleBackoff()
          break
        }
      }
    } finally {
      flushing = null
    }
    if (result.sent > 0) for (const l of flushedListeners) l(result)
    return result
  })()
  return flushing
}

/** Puts a failed item back in line and tries again now. */
export function retryQueued(key: string, send: SendCreate): Promise<FlushResult> {
  setItems(items.map(i => i.key === key ? { ...i, status: 'pending', error: undefined } : i))
  backoffStep = 0
  cancelBackoff()
  return flushQueue(send)
}

function defaultOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

/** Logout / account switch: forget every user's queue on this device. */
export async function clearOfflineQueue(): Promise<void> {
  loadSeq++
  userId = null
  items = []
  backoffStep = 0
  cancelBackoff()
  emit()
  await kvDelPrefix(STORAGE_PREFIX)
}

/**
 * Create now, or keep it for later when there is no connection. While older
 * items are still waiting, a new one joins the line so the order holds.
 */
export async function createOrQueue<T extends { data: { id: string } }>(
  payload: TransactionPayload,
  create: (payload: TransactionPayload, opts: { idempotencyKey: string }) => Promise<T>,
  online: () => boolean = defaultOnline,
): Promise<{ id: string; queued: boolean }> {
  const key = newIdempotencyKey()
  if (userId && (!online() || hasPending())) {
    enqueueCreate(payload, key)
    if (online()) void flushQueue(create)
    return { id: queuedId(key), queued: true }
  }
  try {
    const res = await create(payload, { idempotencyKey: key })
    return { id: res.data.id, queued: false }
  } catch (err) {
    if (userId && isOfflineError(err)) {
      enqueueCreate(payload, key)
      scheduleBackoff()
      lastSend = create
      return { id: queuedId(key), queued: true }
    }
    throw err
  }
}

/** Test helper. */
export function __resetQueueForTests() {
  loadSeq++
  userId = null
  items = []
  flushing = null
  backoffStep = 0
  lastSend = null
  cancelBackoff()
  listeners.clear()
  flushedListeners.clear()
}
