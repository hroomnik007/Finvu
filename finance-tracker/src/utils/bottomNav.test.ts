import { describe, expect, it } from 'vitest'
import { activeBottomTab, bottomTabs, moreMenuPages } from './bottomNav'

describe('bottom nav model', () => {
  it.each([
    [false, false, ['dashboard', 'income', 'expenses', 'more'], ['search', 'annual', 'settings']],
    [true, false, ['dashboard', 'income', 'expenses', 'more'], ['search', 'savings', 'annual', 'settings']],
    [false, true, ['dashboard', 'income', 'expenses', 'household', 'more'], ['search', 'annual', 'settings']],
    [true, true, ['dashboard', 'income', 'expenses', 'household', 'more'], ['search', 'savings', 'annual', 'settings']],
  ])('savings=%s household=%s', (savingsEnabled, householdEnabled, tabs, more) => {
    expect(bottomTabs({ householdEnabled })).toEqual(tabs)
    expect(moreMenuPages({ savingsEnabled })).toEqual(more)
  })
  it('maps pages to the active tab', () => {
    expect(activeBottomTab('dashboard')).toBe('dashboard')
    expect(activeBottomTab('income')).toBe('income')
    expect(activeBottomTab('household')).toBe('household')
    for (const p of ['variable-expenses', 'fixed-expenses', 'categories'] as const) expect(activeBottomTab(p)).toBe('expenses')
    for (const p of ['search', 'savings', 'annual', 'settings'] as const) expect(activeBottomTab(p)).toBe('more')
  })
})
