import { describe, expect, it } from 'vitest'
import { authErrorMessage, isTooManyAttempts } from './authError'

const axiosErr = (status: number, data: unknown) => ({ response: { status, data } })

describe('authErrorMessage', () => {
  it('translates the lockout by its code', () => {
    const err = axiosErr(429, { error: 'Príliš veľa pokusov. Skúste neskôr.', code: 'TOO_MANY_ATTEMPTS' })
    expect(authErrorMessage(err, 'fallback', 'Too many attempts.')).toBe('Too many attempts.')
  })
  it('keeps the server message otherwise', () => {
    expect(authErrorMessage(axiosErr(401, { error: 'Nesprávny PIN.' }), 'fallback', 'x')).toBe('Nesprávny PIN.')
  })
  it('falls back without a response', () => {
    expect(authErrorMessage(new Error('network'), 'fallback', 'x')).toBe('fallback')
  })
})

describe('isTooManyAttempts', () => {
  it('is true only for 429', () => {
    expect(isTooManyAttempts(axiosErr(429, {}))).toBe(true)
    expect(isTooManyAttempts(axiosErr(401, {}))).toBe(false)
    expect(isTooManyAttempts(new Error('x'))).toBe(false)
  })
})
