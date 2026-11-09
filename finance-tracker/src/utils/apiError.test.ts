import { describe, it, expect } from 'vitest'
import { apiErrorMessage } from './apiError'
import { sk } from '../i18n/sk'
import { en } from '../i18n/en'
import { cs } from '../i18n/cs'
import { pl } from '../i18n/pl'
import { hu } from '../i18n/hu'

const res = (status: number, data: unknown) => ({ response: { status, data } })

describe('apiErrorMessage', () => {
  it('translates a known server code', () => {
    const err = res(409, { error: 'Leave your current household first.', code: 'LEAVE_HOUSEHOLD_FIRST' })
    expect(apiErrorMessage(err, 'fallback', sk)).toBe(sk.apiErrors.LEAVE_HOUSEHOLD_FIRST)
    expect(apiErrorMessage(err, 'fallback', en)).toBe('Leave your current household first.')
  })

  it('falls back to sign-in codes and a bare 429', () => {
    expect(apiErrorMessage(res(401, { code: 'ACCOUNT_DEACTIVATED' }), 'x', sk)).toBe(sk.auth.accountDeactivated)
    expect(apiErrorMessage(res(429, {}), 'x', sk)).toBe(sk.auth.tooManyAttempts)
  })

  it('never shows the server text for an unknown code or a network error', () => {
    expect(apiErrorMessage(res(400, { error: 'Validation error' }), 'Uloženie zlyhalo', sk)).toBe('Uloženie zlyhalo')
    expect(apiErrorMessage(new Error('Network Error'), 'Uloženie zlyhalo', sk)).toBe('Uloženie zlyhalo')
  })

  it('every language translates every code, and every backend code is translated', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(join(__dirname, '..', '..', '..', 'backend', 'src', 'lib', 'apiErrors.ts'), 'utf8')
    const codes = [...src.matchAll(/^ {2}([A-Z_]+):/gm)].map(m => m[1]).sort()
    for (const lang of [sk, cs, pl, hu, en]) {
      expect(Object.keys(lang.apiErrors).sort()).toEqual(codes)
      for (const v of Object.values(lang.apiErrors)) expect(v.length).toBeGreaterThan(0)
    }
  })
})
