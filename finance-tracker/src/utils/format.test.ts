import { describe, expect, it } from 'vitest'
import { toLocalISO } from './format'

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
