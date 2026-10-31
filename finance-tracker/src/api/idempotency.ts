import type { AxiosRequestConfig, AxiosResponse } from 'axios'

// Client side of the server's Idempotency-Key support
// (backend/src/middleware/idempotency.ts). Each create gets a fresh key; a
// retry of the same create must reuse it, so the server answers with the row
// it already made instead of adding a second one. The 401 refresh interceptor
// in client.ts re-sends the original config, so the key survives that retry.

export const IDEMPOTENCY_HEADER = 'Idempotency-Key'

export function newIdempotencyKey(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  // Older Safari/WebViews without randomUUID: 16 random bytes as hex.
  const bytes = new Uint8Array(16)
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export interface IdempotentOptions {
  /** Reuse a key (e.g. a queued offline create); a new one is made otherwise. */
  idempotencyKey?: string
}

interface MaybeAxiosError {
  response?: { status?: number; data?: { code?: unknown } }
  code?: string
}

/**
 * Worth sending again with the same key: the request never got an answer
 * (network drop, timeout), or the server is still finishing the first try.
 * Anything else — including validation errors — is final.
 */
export function isRetryableCreateError(err: unknown): boolean {
  const e = err as MaybeAxiosError | null
  if (!e || typeof e !== 'object') return false
  if (e.code === 'ERR_CANCELED') return false
  if (!e.response) return true
  return e.response.status === 409 && e.response.data?.code === 'IDEMPOTENCY_IN_PROGRESS'
}

export const CREATE_RETRY_DELAYS_MS = [600, 1800]

type Post = <T>(url: string, body: unknown, config: AxiosRequestConfig) => Promise<AxiosResponse<T>>

/** POST with an Idempotency-Key, re-sent with the same key on a lost answer. */
export async function postIdempotent<T>(
  post: Post,
  url: string,
  body: unknown,
  opts: IdempotentOptions = {},
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<AxiosResponse<T>> {
  const key = opts.idempotencyKey ?? newIdempotencyKey()
  const config: AxiosRequestConfig = { headers: { [IDEMPOTENCY_HEADER]: key } }
  for (let attempt = 0; ; attempt++) {
    try {
      return await post<T>(url, body, config)
    } catch (err) {
      if (attempt >= CREATE_RETRY_DELAYS_MS.length || !isRetryableCreateError(err)) throw err
      await wait(CREATE_RETRY_DELAYS_MS[attempt])
    }
  }
}
