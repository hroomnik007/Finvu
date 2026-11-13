import { describe, it, expect } from 'vitest'
import { monthForecast } from './monthForecast'

describe('monthForecast', () => {
  it('counts rent once instead of extrapolating it as daily spending', () => {
    // 9th of a 30-day month: 650 rent paid on the 1st, 375 variable so far
    const f = monthForecast({ income: 1820, fixedPaid: 650, fixedPending: 0, variable: 375, day: 9, daysInMonth: 30 })
    expect(f.variablePerDay).toBeCloseTo(41.67, 2)
    expect(f.balance).toBeCloseTo(1820 - 650 - 1250, 2) // −80, not −1596 as with rent in the pace
  })

  it('subtracts fixed payments that are still to come', () => {
    const f = monthForecast({ income: 2000, fixedPaid: 0, fixedPending: 650, variable: 100, day: 10, daysInMonth: 30 })
    expect(f.balance).toBeCloseTo(2000 - 650 - 300, 2)
  })

  it('equals the actual balance for a finished month', () => {
    const f = monthForecast({ income: 1500, fixedPaid: 700, fixedPending: 0, variable: 420, day: 31, daysInMonth: 31 })
    expect(f.balance).toBeCloseTo(1500 - 700 - 420, 2)
  })

  it('handles the first day and no spending', () => {
    expect(monthForecast({ income: 1000, fixedPaid: 0, fixedPending: 0, variable: 0, day: 1, daysInMonth: 30 }))
      .toEqual({ balance: 1000, expenses: 0, variablePerDay: 0 })
    // a day of 0 is treated as the first day, never a division by zero
    expect(monthForecast({ income: 0, fixedPaid: 0, fixedPending: 0, variable: 30, day: 0, daysInMonth: 30 }).variablePerDay).toBe(30)
  })

  it('counts expenses dated later this month once, outside the daily pace', () => {
    // 13th of 30: 238.80 spent so far, 500 already entered for the 28th
    const f = monthForecast({ income: 1500, fixedPaid: 650, fixedPending: 40, variable: 238.8, variablePlanned: 500, day: 13, daysInMonth: 30 })
    expect(f.variablePerDay).toBeCloseTo(18.37, 2)
    expect(f.expenses).toBeCloseTo(650 + 40 + (238.8 / 13) * 30 + 500, 2)
    expect(f.balance).toBeCloseTo(1500 - f.expenses, 6)
  })
})
