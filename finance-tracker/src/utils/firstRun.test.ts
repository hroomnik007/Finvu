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
  it('lists the required steps and the optional tracking date and PIN; household only when enabled', () => {
    expect(firstRunSteps(none).map(s => s.id)).toEqual(['income', 'expense', 'budget', 'tracking', 'pin'])
    const withHh = firstRunSteps({ ...none, householdEnabled: true })
    expect(withHh.map(s => s.id)).toEqual(['income', 'expense', 'budget', 'tracking', 'pin', 'household'])
    expect(withHh.filter(s => s.optional).map(s => s.id)).toEqual(['tracking', 'pin', 'household'])
  })
  it('offers the budget template first while it is open', () => {
    const s = firstRunSteps({ ...none, offerTemplate: true })
    expect(s[0]).toEqual({ id: 'template', done: false, optional: true })
  })
  it('leaves out a tracking suggestion that was dismissed, unless a date is set', () => {
    expect(firstRunSteps({ ...none, trackingDismissed: true }).map(s => s.id)).not.toContain('tracking')
    expect(firstRunSteps({ ...none, trackingDismissed: true, trackingSet: true }).find(s => s.id === 'tracking')?.done).toBe(true)
  })
  it('ticks steps from data', () => {
    const s = firstRunSteps({ ...none, hasIncome: true, hasBudget: true, trackingSet: true, hasPin: true })
    expect(s.filter(x => x.done).map(x => x.id)).toEqual(['income', 'budget', 'tracking', 'pin'])
  })
})

describe('shouldShowFirstRun', () => {
  it('hides once all required steps are done, even if optional ones are not', () => {
    const steps = firstRunSteps({ ...none, hasIncome: true, hasExpense: true, hasBudget: true, householdEnabled: true, offerTemplate: true })
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
