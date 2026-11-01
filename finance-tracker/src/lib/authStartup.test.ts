import { describe, expect, it, vi } from 'vitest'
import { resolveStartupFailure } from './authStartup'

const user = { id: 'u1', email: 'a@b.sk', name: 'A' }
const deps = (...args: [unknown?]) => ({
  readCachedUser: vi.fn(async () => (args.length ? args[0] : user)),
  clearUserData: vi.fn(),
})
const httpError = (status: number) => ({ response: { status } })
const networkError = { code: 'ERR_NETWORK' } // no response at all

describe('resolveStartupFailure', () => {
  it('opens the cached account when there is no connection, without clearing anything', async () => {
    const d = deps()
    expect(await resolveStartupFailure(networkError, d)).toEqual(user)
    expect(d.clearUserData).not.toHaveBeenCalled()
  })

  it('offline with nothing usable cached: no user, nothing cleared', async () => {
    for (const bad of [undefined, null, 'x', { name: 'no id' }]) {
      const d = deps(bad)
      expect(await resolveStartupFailure(networkError, d)).toBeNull()
      expect(d.clearUserData).not.toHaveBeenCalled()
    }
    const d = deps()
    d.readCachedUser.mockRejectedValueOnce(new Error('idb'))
    expect(await resolveStartupFailure(networkError, d)).toBeNull()
  })

  it('wipes the cached account when the server says the session is over (401)', async () => {
    const d = deps()
    expect(await resolveStartupFailure(httpError(401), d)).toBeNull()
    expect(d.clearUserData).toHaveBeenCalledTimes(1)
    expect(d.readCachedUser).not.toHaveBeenCalled() // never falls back to the cache
  })

  it('does not wipe on other server errors', async () => {
    for (const status of [429, 500, 502, 503]) {
      const d = deps()
      expect(await resolveStartupFailure(httpError(status), d)).toBeNull()
      expect(d.clearUserData).not.toHaveBeenCalled()
    }
  })
})
