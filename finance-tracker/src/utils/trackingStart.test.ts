import { describe, expect, it } from 'vitest'
import { trackingStartOf } from './trackingStart'

describe('trackingStartOf', () => {
  it('prefers tracking_start_date', () => {
    expect(trackingStartOf({ tracking_start_date: '2026-04-01', createdAt: '2026-01-10T10:00:00Z' })).toBe('2026-04-01')
  })
  it('falls back to the account creation day', () => {
    expect(trackingStartOf({ tracking_start_date: null, createdAt: '2026-02-15T10:00:00Z' })?.slice(0, 7)).toBe('2026-02')
  })
  it('is null without a user or dates', () => {
    expect(trackingStartOf(null)).toBeNull()
    expect(trackingStartOf({})).toBeNull()
  })
})
