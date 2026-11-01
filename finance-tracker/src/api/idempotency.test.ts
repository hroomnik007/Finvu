import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'
import type { AxiosRequestConfig, AxiosResponse } from 'axios'
import { CREATE_RETRY_DELAYS_MS, IDEMPOTENCY_HEADER, isRetryableCreateError, newIdempotencyKey, postIdempotent } from './idempotency'

const SERVER_KEY_RE = /^[A-Za-z0-9_-]{8,100}$/ // backend/src/middleware/idempotency.ts

describe('newIdempotencyKey', () => {
  it('makes unique keys the server accepts', () => {
    const keys = new Set(Array.from({ length: 200 }, newIdempotencyKey))
    expect(keys.size).toBe(200)
    for (const k of keys) expect(k).toMatch(SERVER_KEY_RE)
  })

  it('falls back to getRandomValues without randomUUID', () => {
    const real = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: (b: Uint8Array) => real.getRandomValues(b) })
    try {
      const k = newIdempotencyKey()
      expect(k).toMatch(/^[0-9a-f]{32}$/)
      expect(k).toMatch(SERVER_KEY_RE)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('isRetryableCreateError', () => {
  it('retries lost answers and in-progress conflicts only', () => {
    expect(isRetryableCreateError({ code: 'ERR_NETWORK' })).toBe(true)
    expect(isRetryableCreateError({ code: 'ECONNABORTED' })).toBe(true)
    expect(isRetryableCreateError({ response: { status: 409, data: { code: 'IDEMPOTENCY_IN_PROGRESS' } } })).toBe(true)
    expect(isRetryableCreateError({ code: 'ERR_CANCELED' })).toBe(false)
    expect(isRetryableCreateError({ response: { status: 400 } })).toBe(false)
    expect(isRetryableCreateError({ response: { status: 409, data: { code: 'OTHER' } } })).toBe(false)
    expect(isRetryableCreateError({ response: { status: 422, data: { code: 'IDEMPOTENCY_KEY_REUSED' } } })).toBe(false)
    expect(isRetryableCreateError({ response: { status: 500 } })).toBe(false)
    expect(isRetryableCreateError(null)).toBe(false)
  })
})

describe('postIdempotent', () => {
  const ok = { data: { ok: true }, status: 201 } as AxiosResponse<{ ok: boolean }>
  const noWait = () => Promise.resolve()

  it('sends one key and reuses it on every retry', async () => {
    const keys: string[] = []
    let n = 0
    const post = vi.fn(async (_u: string, _b: unknown, c: AxiosRequestConfig) => {
      keys.push(String((c.headers as Record<string, string>)[IDEMPOTENCY_HEADER]))
      if (n++ < 2) throw { code: 'ERR_NETWORK' }
      return ok
    })
    const res = await postIdempotent(post as never, '/api/transactions', { a: 1 }, {}, noWait)
    expect(res).toBe(ok)
    expect(post).toHaveBeenCalledTimes(3)
    expect(new Set(keys).size).toBe(1)
    expect(keys[0]).toMatch(SERVER_KEY_RE)
  })

  it('uses a provided key', async () => {
    const post = vi.fn(async (_u: string, _b: unknown, c: AxiosRequestConfig) => {
      expect((c.headers as Record<string, string>)[IDEMPOTENCY_HEADER]).toBe('queued-key-123')
      return ok
    })
    await postIdempotent(post as never, '/x', {}, { idempotencyKey: 'queued-key-123' }, noWait)
    expect(post).toHaveBeenCalledOnce()
  })

  it('stops after the last delay and does not retry validation errors', async () => {
    const down = vi.fn(async () => { throw { code: 'ERR_NETWORK' } })
    const waits: number[] = []
    await expect(postIdempotent(down as never, '/x', {}, {}, async (ms) => { waits.push(ms) })).rejects.toEqual({ code: 'ERR_NETWORK' })
    expect(down).toHaveBeenCalledTimes(CREATE_RETRY_DELAYS_MS.length + 1)
    expect(waits).toEqual(CREATE_RETRY_DELAYS_MS)

    const invalid = vi.fn(async () => { throw { response: { status: 400 } } })
    await expect(postIdempotent(invalid as never, '/x', {}, {}, noWait)).rejects.toBeTruthy()
    expect(invalid).toHaveBeenCalledOnce()
  })
})

describe('create calls send the key', () => {
  const src = (p: string) => readFileSync(join(__dirname, p), 'utf8')
  it.each([
    ['transactions.ts', "'/api/transactions'"],
    ['transactions.ts', "'/api/transactions/bulk'"],
    ['categories.ts', "'/api/categories'"],
    ['savings.ts', "'/api/savings'"],
    ['savings.ts', '`/api/savings/${goalId}/deposits`'],
  ])('%s %s', (file, url) => {
    const s = src(file)
    expect(s).toContain(`postIdempotent<`)
    expect(s).toMatch(new RegExp(`postIdempotent<[^(]*>\\(apiClient\\.post, ${url.replace(/[$/{}`]/g, (m) => '\\' + m)}`))
    expect(s).not.toContain(`apiClient.post(${url}`)
  })
})
