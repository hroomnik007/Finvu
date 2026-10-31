import { describe, expect, it } from 'vitest'
import { accentFill, accentFillEnd, contrastRatio, readableAccent } from './theme'

const ACCENTS = ['#7C3AED', '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#EF4444']

describe('accent colours reach WCAG AA', () => {
  it('contrastRatio matches known values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#3B82F6', '#ffffff')).toBeCloseTo(3.68, 2)
  })

  it.each(ACCENTS)('white text on the %s button gradient is ≥ 4.5:1', (c) => {
    expect(contrastRatio(accentFill(c), '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(accentFillEnd(c), '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps an accent that already passes unchanged', () => {
    expect(accentFill('#7C3AED').toLowerCase()).toBe('#7c3aed')
  })

  it.each(ACCENTS)('%s as text is ≥ 4.5:1 on the dark and light surfaces', (c) => {
    for (const bg of ['#26366B', '#1E3A57', '#000D19']) expect(contrastRatio(readableAccent(c, 'dark'), bg)).toBeGreaterThanOrEqual(4.5)
    for (const bg of ['#DAEAFA', '#E2DDFC', '#FFFFFF']) expect(contrastRatio(readableAccent(c, 'light'), bg)).toBeGreaterThanOrEqual(4.5)
  })
})
