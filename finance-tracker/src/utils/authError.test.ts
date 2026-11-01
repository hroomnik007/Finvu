import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { authErrorCode, authErrorMessage, isTooManyAttempts, rateLimitedMessage } from './authError'
import { sk } from '../i18n/sk'
import { cs } from '../i18n/cs'
import { en } from '../i18n/en'
import { pl } from '../i18n/pl'
import { hu } from '../i18n/hu'

const axiosErr = (status: number, data: unknown) => ({ response: { status, data } })
const t = sk.auth

describe('authErrorMessage', () => {
  it('maps every sign-in code to its translation, never the English server text', () => {
    const cases: [number, string, string][] = [
      [429, 'AUTH_RATE_LIMITED', t.tooManyAttempts],
      [429, 'TOO_MANY_ATTEMPTS', t.tooManyAttempts],
      [401, 'INVALID_CREDENTIALS', t.invalidCredentials],
      [401, 'INVALID_PIN', t.wrongPin],
      [401, 'PASSKEY_FAILED', t.passkeyFailed],
      [403, 'EMAIL_NOT_VERIFIED', t.notVerified],
      [403, 'ACCOUNT_DEACTIVATED', t.accountDeactivated],
    ]
    for (const [status, code, text] of cases) {
      expect(authErrorMessage(axiosErr(status, { error: 'English text', code }), 'fallback', t)).toBe(text)
    }
  })
  it('unknown email and wrong password show the same text', () => {
    const body = { error: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' }
    expect(authErrorMessage(axiosErr(401, body), 'x', t)).toBe('Nesprávny e-mail alebo heslo.')
  })
  it('falls back to the generic message for unknown codes and uncoded errors', () => {
    expect(authErrorMessage(axiosErr(401, { error: 'Something', code: 'NEW_CODE' }), 'fallback', t)).toBe('fallback')
    expect(authErrorMessage(axiosErr(400, { error: 'Validation error' }), 'fallback', t)).toBe('fallback')
    expect(authErrorMessage(new Error('network'), 'fallback', t)).toBe('fallback')
  })
  it('treats an uncoded 429 as rate limited', () => {
    expect(authErrorMessage(axiosErr(429, 'Too Many Requests'), 'fallback', t)).toBe(t.tooManyAttempts)
  })
})

describe('rateLimitedMessage', () => {
  it('is set only for the rate limit', () => {
    expect(rateLimitedMessage(axiosErr(429, { code: 'AUTH_RATE_LIMITED' }), t)).toBe(t.tooManyAttempts)
    expect(rateLimitedMessage(axiosErr(400, { error: 'Email exists' }), t)).toBeNull()
  })
})

describe('authErrorCode / isTooManyAttempts', () => {
  it('reads the code', () => {
    expect(authErrorCode(axiosErr(401, { code: 'INVALID_PIN' }))).toBe('INVALID_PIN')
    expect(authErrorCode(axiosErr(401, { code: 5 }))).toBeUndefined()
    expect(authErrorCode(new Error('x'))).toBeUndefined()
  })
  it('is true only for 429', () => {
    expect(isTooManyAttempts(axiosErr(429, {}))).toBe(true)
    expect(isTooManyAttempts(axiosErr(401, {}))).toBe(false)
    expect(isTooManyAttempts(new Error('x'))).toBe(false)
  })
})

describe('translations', () => {
  const keys = ['tooManyAttempts', 'invalidCredentials', 'wrongPin', 'passkeyFailed', 'notVerified', 'accountDeactivated'] as const
  it('exist and differ from English in every language', () => {
    for (const lang of [sk, cs, pl, hu]) {
      for (const k of keys) {
        expect(lang.auth[k], k).toBeTruthy()
        expect(lang.auth[k], k).not.toBe(en.auth[k])
      }
    }
  })
  it('Slovak and Czech use informal ty', () => {
    expect(sk.auth.accountDeactivated).toMatch(/Tvoj .*kontaktuj/)
    expect(cs.auth.accountDeactivated).toMatch(/Tvůj .*kontaktuj/)
  })
})

describe('sign-in screens', () => {
  const login = readFileSync(join(__dirname, '../pages/Login.tsx'), 'utf8')
  it('never show the server error text on Login', () => {
    expect(login).not.toMatch(/data\?\.error/)
    expect(login.match(/authErrorMessage\(err, t\.auth\.\w+, t\.auth\)/g)?.length).toBe(2)
  })
})
