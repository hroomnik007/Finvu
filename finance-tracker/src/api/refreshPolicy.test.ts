import { describe, expect, it } from 'vitest'
import { shouldRefreshOn401 } from './refreshPolicy'

describe('shouldRefreshOn401', () => {
  it('skips sign-in endpoints so their coded error reaches the screen', () => {
    for (const u of ['/api/auth/login', '/api/auth/pin-login', '/api/auth/webauthn/authenticate-verify', '/api/auth/google', '/api/auth/admin-login', '/api/auth/refresh']) {
      expect(shouldRefreshOn401(u), u).toBe(false)
      expect(shouldRefreshOn401('http://localhost:3911' + u + '?x=1'), u).toBe(false)
    }
  })
  it('refreshes for ordinary API calls', () => {
    expect(shouldRefreshOn401('/api/transactions')).toBe(true)
    expect(shouldRefreshOn401('/api/auth/me')).toBe(true)
    expect(shouldRefreshOn401(undefined)).toBe(true)
  })
})
