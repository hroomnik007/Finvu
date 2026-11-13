import { describe, it, expect } from 'vitest'
import { cashFlowOutlook } from './cashFlow'

describe('cashFlowOutlook', () => {
  it('finds the low point before the payday', () => {
    // 13th of a 30-day month: 500 in the account, rent 650 on the 20th, pay 1500 on the 25th
    const o = cashFlowOutlook({
      balanceToday: 500, today: 13, daysInMonth: 30,
      events: [{ day: 20, amount: -650 }, { day: 25, amount: 1500 }],
    })
    expect(o).toEqual({ lowest: -150, lowestDay: 20, end: 1350 })
  })

  it('keeps today as the low point when only money comes in', () => {
    const o = cashFlowOutlook({ balanceToday: 200, today: 10, daysInMonth: 31, events: [{ day: 15, amount: 300 }] })
    expect(o).toEqual({ lowest: 200, lowestDay: 10, end: 500 })
  })

  it('ignores what is already behind and applies the daily pace', () => {
    const o = cashFlowOutlook({
      balanceToday: 100, today: 28, daysInMonth: 30, variablePerDay: 10,
      events: [{ day: 5, amount: -999 }, { day: 28, amount: -999 }],
    })
    expect(o).toEqual({ lowest: 80, lowestDay: 30, end: 80 })
  })

  it('moves a 31st to the last day of a shorter month', () => {
    const o = cashFlowOutlook({ balanceToday: 0, today: 1, daysInMonth: 28, events: [{ day: 31, amount: -50 }] })
    expect(o).toEqual({ lowest: -50, lowestDay: 28, end: -50 })
  })
})
