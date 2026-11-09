import { describe, expect, it } from 'vitest'
import { sharedFixedLimit, sharedLimitFor } from './sharedLimit'

describe('sharedFixedLimit', () => {
  it('a shared category where a member has fixed expenses edits the reserve', () => {
    // Telekomunikácie: the partner pays Telekom 37 € a month
    expect(sharedFixedLimit({ shared: true, sharedFixedTotal: 37, sharedReserve: 23 })).toEqual({ fixedTotal: 37, reserve: 23 })
    expect(sharedFixedLimit({ shared: true, sharedFixedTotal: 37 })).toEqual({ fixedTotal: 37, reserve: 0 })
  })

  it('keeps the manual limit for shared variable-only and non-shared categories', () => {
    expect(sharedFixedLimit({ shared: true, sharedFixedTotal: 0, sharedReserve: 10 })).toBeNull()
    expect(sharedFixedLimit({ shared: true })).toBeNull()
    expect(sharedFixedLimit({ shared: false, sharedFixedTotal: 37 })).toBeNull()
    expect(sharedFixedLimit(null)).toBeNull()
  })
})

describe('sharedLimitFor', () => {
  it('adds the reserve to the fixed total', () => {
    expect(sharedLimitFor(37, 23)).toBe(60)
    expect(sharedLimitFor(37, 0)).toBe(37)
    expect(sharedLimitFor(0.1, 0.2)).toBe(0.3)
    expect(sharedLimitFor(37, -5)).toBe(37)
  })
})
