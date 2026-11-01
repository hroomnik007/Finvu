import { describe, expect, it } from 'vitest'
import { defaultEntryDate, recentMonths, sortCategoriesByUsage, dateForRecurringToggle, pickerCategories } from './entryDefaults'

const today = new Date(2026, 9, 31) // 31 Oct 2026

describe('defaultEntryDate', () => {
  it('uses today in the running month', () => { expect(defaultEntryDate(10, 2026, today)).toBe('2026-10-31') })
  it('uses the last day of a past month', () => {
    expect(defaultEntryDate(9, 2026, today)).toBe('2026-09-30')
    expect(defaultEntryDate(2, 2024, today)).toBe('2024-02-29')
    expect(defaultEntryDate(12, 2025, new Date(2026, 0, 5))).toBe('2025-12-31')
  })
  it('keeps the day of month in a future month, clamped', () => {
    expect(defaultEntryDate(11, 2026, today)).toBe('2026-11-30')
    expect(defaultEntryDate(2, 2027, today)).toBe('2027-02-28')
    expect(defaultEntryDate(11, 2026, new Date(2026, 9, 12))).toBe('2026-11-12')
  })
})

describe('sortCategoriesByUsage', () => {
  const cats = [{ id: 'a', name: 'Zábava' }, { id: 'b', name: 'Bývanie' }, { id: 'c', name: 'Čistiace' }, { id: 'd', name: 'Doprava' }]
  it('puts the most used first', () => {
    expect(sortCategoriesByUsage(cats, ['d', 'a', 'd', null, 'a', 'd'], 'sk').map(c => c.id)).toEqual(['d', 'a', 'b', 'c'])
  })
  it('falls back to A–Z with locale collation (č after c)', () => {
    expect(sortCategoriesByUsage(cats, [], 'sk').map(c => c.name)).toEqual(['Bývanie', 'Čistiace', 'Doprava', 'Zábava'])
  })
  it('does not mutate the input', () => {
    const copy = [...cats]; sortCategoriesByUsage(cats, ['a']); expect(cats).toEqual(copy)
  })
})

describe('recentMonths', () => {
  it('crosses the year boundary', () => {
    expect(recentMonths(2, 2026, 3)).toEqual([[2, 2026], [1, 2026], [12, 2025]])
  })
})

describe('dateForRecurringToggle', () => {
  const today = new Date(2026, 9, 31) // 31 Oct 2026
  it('a recurring item defaults to today even while a past month is viewed', () => {
    expect(dateForRecurringToggle('2026-03-31', true, 3, 2026, today)).toBe('2026-10-31')
  })
  it('switching back to one-off restores the viewed month default', () => {
    expect(dateForRecurringToggle('2026-10-31', false, 3, 2026, today)).toBe('2026-03-31')
  })
  it('keeps a date the user picked', () => {
    expect(dateForRecurringToggle('2026-03-12', true, 3, 2026, today)).toBe('2026-03-12')
    expect(dateForRecurringToggle('2026-03-12', false, 3, 2026, today)).toBe('2026-03-12')
  })
})

describe('pickerCategories', () => {
  const cats = [
    { id: 'food', type: 'expense' as const },
    { id: 'salary', type: 'income' as const },
    { id: 'rent', type: 'expense' as const },
  ]
  it('offers only categories of the entry type', () => {
    expect(pickerCategories(cats, 'expense').map(c => c.id)).toEqual(['food', 'rent'])
    expect(pickerCategories(cats, 'income').map(c => c.id)).toEqual(['salary'])
  })
  it('keeps a mismatched category already on the edited entry', () => {
    expect(pickerCategories(cats, 'expense', 'salary').map(c => c.id)).toEqual(['food', 'salary', 'rent'])
    expect(pickerCategories(cats, 'expense', null).map(c => c.id)).toEqual(['food', 'rent'])
  })
})
