import { describe, expect, it } from 'vitest'
import { isFixedExpenseDue, parseDescription } from './useFixedExpenses'

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
})
