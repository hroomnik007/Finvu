import { describe, expect, it } from 'vitest'
import { dailyBudget } from './dailyBudget'

describe('dailyBudget', () => {
  it('spreads what is left after unpaid fixed payments over the remaining days', () => {
    // 15 Oct of 31: 17 days left (today included)
    const b = dailyBudget({ income: 2000, spent: 700, pendingFixed: 300, day: 15, daysInMonth: 31 })!
    expect(b.left).toBe(1000)
    expect(b.daysLeft).toBe(17)
    expect(b.perDay).toBeCloseTo(1000 / 17)
    expect(b.over).toBe(false)
  })

  it('reports an overspent month with nothing to spend', () => {
    const b = dailyBudget({ income: 1000, spent: 900, pendingFixed: 300, day: 20, daysInMonth: 30 })!
    expect(b.over).toBe(true)
    expect(b.left).toBe(-200)
    expect(b.perDay).toBe(0)
  })

  it('counts the last day as one day and has no answer without income', () => {
    expect(dailyBudget({ income: 100, spent: 40, pendingFixed: 0, day: 31, daysInMonth: 31 })!.daysLeft).toBe(1)
    expect(dailyBudget({ income: 0, spent: 40, pendingFixed: 0, day: 5, daysInMonth: 31 })).toBeNull()
  })
})
