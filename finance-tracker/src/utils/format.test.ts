import { describe, expect, it } from 'vitest'
import { formatDateLocale, formatMoney, formatMoneyParts, toLocalISO } from './format'

describe('toLocalISO', () => {
  it('uses the local calendar date, not the UTC one', () => {
    // 00:30 local on 1 November: in a time zone ahead of UTC the UTC date is still 31 October
    expect(toLocalISO(new Date(2026, 10, 1, 0, 30))).toBe('2026-11-01')
    expect(toLocalISO(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })

  it('pads month and day', () => {
    expect(toLocalISO(new Date(2026, 2, 3, 12))).toBe('2026-03-03')
  })
})

// Intl output uses (narrow) no-break spaces; normalise them so assertions stay readable.
const norm = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ')

describe('formatMoney', () => {
  it('follows the given locale and currency', () => {
    expect(norm(formatMoney(1234.5, 'sk-SK', 'EUR'))).toBe('1 234,50 €')
    expect(norm(formatMoney(1234.5, 'en-GB', 'EUR'))).toBe('€1,234.50')
    expect(norm(formatMoney(1234.5, 'pl-PL', 'PLN'))).toBe('1234,50 zł')
    expect(norm(formatMoney(1234.5, 'hu-HU', 'HUF'))).toContain('Ft')
  })

  it('never renders negative zero', () => {
    expect(norm(formatMoney(-0.001, 'sk-SK', 'EUR'))).toBe('0,00 €')
  })

  it('falls back to sk-SK/EUR on an invalid currency', () => {
    expect(norm(formatMoney(1, 'sk-SK', 'NOT_A_CURRENCY'))).toBe('1,00 €')
  })
})

describe('formatMoneyParts', () => {
  it('splits integer and decimal parts without carry bugs', () => {
    const p = formatMoneyParts(99.999, 'sk-SK', 'EUR')
    expect(norm(p.main)).toBe('100')
    expect(norm(p.rest)).toBe(',00 €')
  })

  it('keeps the currency prefix in the main part for en-GB', () => {
    const p = formatMoneyParts(12.3, 'en-GB', 'EUR')
    expect(p.main).toBe('€12')
    expect(p.rest).toBe('.30')
  })
})

describe('formatDateLocale', () => {
  it('treats YYYY-MM-DD as a local date', () => {
    expect(formatDateLocale('2026-03-01', 'en-GB')).toBe('1 March 2026')
    expect(formatDateLocale('2026-03-01', 'sk-SK')).toBe('1. marca 2026')
  })
})
