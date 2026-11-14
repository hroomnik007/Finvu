import { describe, expect, it } from 'vitest'
import { isFixedExpenseDue, isNewerRow, monthlyEquivalent, occursInMonth, parseDescription } from './useFixedExpenses'

// 15 Oct 2026, local noon
const TODAY = new Date(2026, 9, 15, 12)

describe('parseDescription', () => {
  it('reads label, note and due day from the JSON description', () => {
    expect(parseDescription(JSON.stringify({ l: 'Nájom', n: 'byt', d: 20 }), 1))
      .toEqual({ label: 'Nájom', note: 'byt', dayOfMonth: 20 })
  })

  it('falls back to the given day when the stored day is missing or out of range', () => {
    expect(parseDescription(JSON.stringify({ l: 'X' }), 7).dayOfMonth).toBe(7)
    expect(parseDescription(JSON.stringify({ l: 'X', d: 40 }), 7).dayOfMonth).toBe(7)
    expect(parseDescription(JSON.stringify({ l: 'X', d: 0 }), 7).dayOfMonth).toBe(7)
  })

  it('treats a plain text description as the label (legacy rows)', () => {
    expect(parseDescription('Netflix', 3)).toEqual({ label: 'Netflix', note: '', dayOfMonth: 3 })
  })

  it('handles an empty description', () => {
    expect(parseDescription(null, 5)).toEqual({ label: '', note: '', dayOfMonth: 5 })
  })
})

// Must stay in step with isFixedDue in backend/src/lib/recurring.ts
describe('isFixedExpenseDue', () => {
  it('counts past months and not future months', () => {
    expect(isFixedExpenseDue(31, 9, 2026, TODAY)).toBe(true)
    expect(isFixedExpenseDue(1, 12, 2025, TODAY)).toBe(true)
    expect(isFixedExpenseDue(1, 11, 2026, TODAY)).toBe(false)
    expect(isFixedExpenseDue(1, 1, 2027, TODAY)).toBe(false)
  })

  it('compares the due day with today in the current month', () => {
    expect(isFixedExpenseDue(14, 10, 2026, TODAY)).toBe(true)
    expect(isFixedExpenseDue(15, 10, 2026, TODAY)).toBe(true)
    expect(isFixedExpenseDue(16, 10, 2026, TODAY)).toBe(false)
  })

  it('moves the 29th–31st to the last day of a shorter month', () => {
    expect(isFixedExpenseDue(31, 2, 2026, new Date(2026, 1, 27))).toBe(false)
    expect(isFixedExpenseDue(31, 2, 2026, new Date(2026, 1, 28))).toBe(true)
    expect(isFixedExpenseDue(31, 4, 2026, new Date(2026, 3, 30))).toBe(true)
    expect(isFixedExpenseDue(31, 5, 2026, new Date(2026, 4, 30))).toBe(false)
  })
})

describe('isNewerRow', () => {
  it('prefers the later date', () => {
    expect(isNewerRow({ date: '2026-10-01', createdAt: '2026-01-01T00:00:00Z' }, { date: '2026-09-01', createdAt: '2026-12-01T00:00:00Z' })).toBe(true)
  })
  it('breaks same-date ties by creation time, like the backend', () => {
    const older = { date: '2026-10-01', createdAt: '2026-10-01T08:00:00Z' }
    const newer = { date: '2026-10-01', createdAt: '2026-10-01T09:00:00Z' }
    expect(isNewerRow(newer, older)).toBe(true)
    expect(isNewerRow(older, newer)).toBe(false)
  })
})

describe('quarterly and yearly items', () => {
  it('reads the period and its month; a monthly item has neither', () => {
    expect(parseDescription(JSON.stringify({ l: 'Poistka', n: '', d: 10, p: 12, m: 3 }), 1))
      .toEqual({ label: 'Poistka', note: '', dayOfMonth: 10, period: 12, anchorMonth: 3 })
    expect(parseDescription(JSON.stringify({ l: 'X', n: '', d: 1, p: 6, m: 1 }), 1)).toEqual({ label: 'X', note: '', dayOfMonth: 1 })
  })

  it('is charged only in its own months', () => {
    const yearly = { period: 12 as const, anchorMonth: 3 }
    const quarterly = { period: 3 as const, anchorMonth: 2 }
    expect([2, 3, 4].map(m => occursInMonth(yearly, m))).toEqual([false, true, false])
    expect([1, 2, 5, 8, 11, 12].map(m => occursInMonth(quarterly, m))).toEqual([false, true, true, true, true, false])
    expect(occursInMonth({}, 7)).toBe(true)
    expect(occursInMonth({ period: 1 }, 7)).toBe(true)
  })

  it('spreads the amount for the per-month average', () => {
    expect(monthlyEquivalent({ amount: 600, period: 12 })).toBe(50)
    expect(monthlyEquivalent({ amount: 90, period: 3 })).toBe(30)
    expect(monthlyEquivalent({ amount: 650 })).toBe(650)
  })
})
