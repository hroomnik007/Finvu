import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetQueueForTests, classifySendError, clearOfflineQueue, createOrQueue, enqueueCreate, flushQueue,
  getQueue, isOfflineError, isQueuedId, onQueueFlushed, queuedId, removeQueued, retryQueued, setQueueUser,
  type SendCreate,
} from './offlineQueue'
import { kvGet } from './kvStore'
import type { TransactionPayload } from '../api/transactions'

const p = (amount: number, extra: Partial<TransactionPayload> = {}): TransactionPayload =>
  ({ type: 'expense', amount, date: '2026-11-01', description: `x${amount}`, isFixed: false, ...extra })
const netErr = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })
const httpErr = (status: number, code?: string) => Object.assign(new Error('http'), { response: { status, data: { code } } })
const online = () => true
const offline = () => false

beforeEach(async () => { __resetQueueForTests(); await clearOfflineQueue(); await setQueueUser('u1') })
afterEach(() => { vi.useRealTimers() })

describe('error classification', () => {
  it('no answer is offline; 5xx/429/in-progress are transient; other 4xx are rejections', () => {
    expect(classifySendError(netErr())).toBe('offline')
    expect(classifySendError(httpErr(503))).toBe('transient')
    expect(classifySendError(httpErr(429))).toBe('transient')
    expect(classifySendError(httpErr(409, 'IDEMPOTENCY_IN_PROGRESS'))).toBe('transient')
    expect(classifySendError(httpErr(400))).toBe('rejected')
    expect(classifySendError(httpErr(422, 'IDEMPOTENCY_KEY_REUSED'))).toBe('rejected')
    expect(isOfflineError(netErr())).toBe(true)
    expect(isOfflineError(Object.assign(new Error('c'), { code: 'ERR_CANCELED' }))).toBe(false)
    expect(isOfflineError(httpErr(500))).toBe(false)
  })
})

describe('queue', () => {
  it('stores items per user in IndexedDB-backed storage, in order', async () => {
    enqueueCreate(p(1), 'key-aaaaaaa1', 1)
    enqueueCreate(p(2), 'key-aaaaaaa2', 2)
    expect(getQueue().map(i => i.key)).toEqual(['key-aaaaaaa1', 'key-aaaaaaa2'])
    const stored = await kvGet<{ key: string }[]>('offline_queue_u1')
    expect(stored?.map(i => i.key)).toEqual(['key-aaaaaaa1', 'key-aaaaaaa2'])
    await setQueueUser('u2')
    expect(getQueue()).toEqual([])
    await setQueueUser('u1')
    expect(getQueue()).toHaveLength(2)
  })

  it('sends in order, reusing each item\u2019s idempotency key', async () => {
    enqueueCreate(p(1), 'key-aaaaaaa1')
    enqueueCreate(p(2), 'key-aaaaaaa2')
    const calls: string[] = []
    const send: SendCreate = async (payload, opts) => { calls.push(`${payload.amount}:${opts.idempotencyKey}`) }
    const flushed = vi.fn()
    onQueueFlushed(flushed)
    const r = await flushQueue(send, online)
    expect(calls).toEqual(['1:key-aaaaaaa1', '2:key-aaaaaaa2'])
    expect(r).toEqual({ sent: 2, failed: 0, stopped: false })
    expect(getQueue()).toEqual([])
    expect(flushed).toHaveBeenCalledOnce()
  })

  it('a network error stops the run and keeps the rest in order; the retry uses the same key', async () => {
    vi.useFakeTimers()
    enqueueCreate(p(1), 'key-aaaaaaa1')
    enqueueCreate(p(2), 'key-aaaaaaa2')
    const keys: string[] = []
    let fail = true
    const send: SendCreate = async (_p, opts) => { keys.push(opts.idempotencyKey); if (fail) throw netErr() }
    const r = await flushQueue(send, online)
    expect(r.stopped).toBe(true)
    expect(keys).toEqual(['key-aaaaaaa1'])
    expect(getQueue().map(i => [i.key, i.attempts])).toEqual([['key-aaaaaaa1', 1], ['key-aaaaaaa2', 0]])
    fail = false
    await vi.advanceTimersByTimeAsync(2000) // first backoff step
    expect(keys).toEqual(['key-aaaaaaa1', 'key-aaaaaaa1', 'key-aaaaaaa2'])
    expect(getQueue()).toEqual([])
  })

  it('a 4xx parks the item as failed and the run goes on; retry and discard work', async () => {
    enqueueCreate(p(1), 'key-aaaaaaa1')
    enqueueCreate(p(2), 'key-aaaaaaa2')
    const send: SendCreate = async (payload) => { if (payload.amount === 1) throw httpErr(400, 'VALIDATION') }
    const r = await flushQueue(send, online)
    expect(r).toEqual({ sent: 1, failed: 1, stopped: false })
    expect(getQueue()).toMatchObject([{ key: 'key-aaaaaaa1', status: 'failed', error: { status: 400, code: 'VALIDATION' } }])
    await retryQueued('key-aaaaaaa1', async () => {})
    expect(getQueue()).toEqual([])
    enqueueCreate(p(3), 'key-aaaaaaa3')
    expect(removeQueued(queuedId('key-aaaaaaa3'))).toBe(true)
    expect(removeQueued('key-aaaaaaa3')).toBe(false)
  })

  it('does nothing while the device is offline', async () => {
    enqueueCreate(p(1), 'key-aaaaaaa1')
    const send = vi.fn(async () => {})
    expect((await flushQueue(send, offline)).stopped).toBe(true)
    expect(send).not.toHaveBeenCalled()
  })

  it('an empty run does not block later runs', async () => {
    const send = vi.fn(async () => {})
    expect(await flushQueue(send, online)).toEqual({ sent: 0, failed: 0, stopped: false })
    enqueueCreate(p(1), 'key-aaaaaaa1')
    expect((await flushQueue(send, online)).sent).toBe(1)
    expect(send).toHaveBeenCalledOnce()
  })

  it('concurrent flushes share one run (no double send)', async () => {
    enqueueCreate(p(1), 'key-aaaaaaa1')
    const send = vi.fn(async () => { await new Promise(r => setTimeout(r, 5)) })
    await Promise.all([flushQueue(send, online), flushQueue(send, online)])
    expect(send).toHaveBeenCalledOnce()
  })

  it('logout clears every stored queue', async () => {
    enqueueCreate(p(1), 'key-aaaaaaa1')
    await clearOfflineQueue()
    expect(getQueue()).toEqual([])
    expect(await kvGet('offline_queue_u1')).toBeUndefined()
  })
})

describe('createOrQueue', () => {
  const ok = (id: string) => vi.fn(async () => ({ data: { id } }))

  it('creates directly when online', async () => {
    const create = ok('srv-1')
    expect(await createOrQueue(p(1), create, online)).toEqual({ id: 'srv-1', queued: false })
    expect(getQueue()).toEqual([])
  })

  it('queues without trying when offline', async () => {
    const create = ok('srv-1')
    const r = await createOrQueue(p(1), create, offline)
    expect(r.queued).toBe(true)
    expect(isQueuedId(r.id)).toBe(true)
    expect(create).not.toHaveBeenCalled()
    expect(getQueue()).toHaveLength(1)
  })

  it('queues with the same key when the request got no answer', async () => {
    vi.useFakeTimers()
    let used = ''
    const create = vi.fn(async (_p: TransactionPayload, o: { idempotencyKey: string }) => { used = o.idempotencyKey; throw netErr() })
    const r = await createOrQueue(p(1), create, online)
    expect(r).toEqual({ id: queuedId(used), queued: true })
    expect(getQueue()[0].key).toBe(used)
  })

  it('a server rejection is not queued', async () => {
    const create = vi.fn(async () => { throw httpErr(400) })
    await expect(createOrQueue(p(1), create, online)).rejects.toMatchObject({ response: { status: 400 } })
    expect(getQueue()).toEqual([])
  })

  it('joins the line while older items wait, so the order holds', async () => {
    enqueueCreate(p(1), 'key-aaaaaaa1')
    const order: number[] = []
    const create = vi.fn(async (payload: TransactionPayload) => { order.push(payload.amount); return { data: { id: 's' } } })
    const r = await createOrQueue(p(2), create, online)
    expect(r.queued).toBe(true)
    await flushQueue(create, online)
    expect(order).toEqual([1, 2])
  })
})
