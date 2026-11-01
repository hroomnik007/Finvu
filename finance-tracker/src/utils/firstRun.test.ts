import { beforeEach, describe, expect, it, vi } from 'vitest'

class MemStorage {
  private m = new Map<string, string>()
  get length() { return this.m.size }
  key(i: number) { return [...this.m.keys()][i] ?? null }
  getItem(k: string) { return this.m.get(k) ?? null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
}
vi.stubGlobal('localStorage', new MemStorage())
vi.stubGlobal('window', new EventTarget())
import { dismissFirstRun, firstRunSteps, isFirstRunDismissed, shouldShowFirstRun } from './firstRun'
import { clearUserData } from '../lib/userDataReset'

const none = { hasIncome: false, hasExpense: false, hasBudget: false, householdEnabled: false, hasHouseholdMember: false }

describe('firstRunSteps', () => {
  it('lists income, expense and budget; household only when enabled and optional', () => {
    expect(firstRunSteps(none).map(s => s.id)).toEqual(['income', 'expense', 'budget'])
    const withHh = firstRunSteps({ ...none, householdEnabled: true })
    expect(withHh.map(s => s.id)).toEqual(['income', 'expense', 'budget', 'household'])
    expect(withHh[3].optional).toBe(true)
  })
  it('ticks steps from data', () => {
    const s = firstRunSteps({ ...none, hasIncome: true, hasBudget: true })
    expect(s.filter(x => x.done).map(x => x.id)).toEqual(['income', 'budget'])
  })
})

describe('shouldShowFirstRun', () => {
  it('hides once all required steps are done, even if the optional one is not', () => {
    const steps = firstRunSteps({ ...none, hasIncome: true, hasExpense: true, hasBudget: true, householdEnabled: true })
    expect(shouldShowFirstRun(steps, false)).toBe(false)
  })
  it('hides when dismissed', () => {
    expect(shouldShowFirstRun(firstRunSteps(none), true)).toBe(false)
    expect(shouldShowFirstRun(firstRunSteps(none), false)).toBe(true)
  })
})

describe('dismissal', () => {
  beforeEach(() => localStorage.clear())
  it('is stored per user id', () => {
    dismissFirstRun('u1')
    expect(isFirstRunDismissed('u1')).toBe(true)
    expect(isFirstRunDismissed('u2')).toBe(false)
  })
  it('is cleared on logout', () => {
    dismissFirstRun('u1')
    clearUserData()
    expect(isFirstRunDismissed('u1')).toBe(false)
  })
})
