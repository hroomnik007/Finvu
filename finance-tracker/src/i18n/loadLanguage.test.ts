import { describe, expect, it } from 'vitest'
import { loadLanguage, resolveLang, sk } from '.'

describe('language loading', () => {
  it('falls back to English for unsupported languages', () => {
    expect(resolveLang('de')).toBe('en')
    expect(resolveLang(undefined)).toBe('en')
    expect(resolveLang('hu')).toBe('hu')
  })

  it('loads each language chunk on demand', async () => {
    for (const lang of ['sk', 'cs', 'pl', 'hu', 'en']) await expect(loadLanguage(lang)).resolves.toBeUndefined()
    const { hu } = await import('./hu')
    expect(hu.auth.wrongPin).not.toBe(sk.auth.wrongPin)
  })
})
