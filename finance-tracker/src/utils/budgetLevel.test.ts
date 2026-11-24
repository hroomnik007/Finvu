import { describe, it, expect } from 'vitest'
import { budgetLevel, limitIsFixedOnly, budgetSeverity, compareBudget } from './budgetLevel'

describe('budgetLevel', () => {
  it('is over at and past the limit', () => {
    expect(budgetLevel(300, 300)).toBe('over')
    expect(budgetLevel(570.68, 300)).toBe('over')
  })

  it('is near from 85 %', () => {
    expect(budgetLevel(255, 300)).toBe('near')
    expect(budgetLevel(254.99, 300)).toBe('ok')
  })

  it('treats a fixed-only limit spent exactly as planned, in either view', () => {
    expect(budgetLevel(113.2, 113.2, true)).toBe('planned')
    expect(budgetLevel(24.9, 24.9, true)).toBe('planned')
    // Anything on top of the fixed payments is a real overrun
    expect(budgetLevel(120, 113.2, true)).toBe('over')
  })

  it('ignores floating point noise when comparing to the limit', () => {
    expect(budgetLevel(0.1 + 0.2, 0.3, true)).toBe('planned')
  })

  it('has no level without a limit', () => {
    expect(budgetLevel(50, 0)).toBe('ok')
  })
})

describe('limitIsFixedOnly', () => {
  it('personal: auto limit without reserve', () => {
    expect(limitIsFixedOnly({ autoLimit: true, limitReserve: 0 })).toBe(true)
    expect(limitIsFixedOnly({ autoLimit: true, limitReserve: 50 })).toBe(false)
    expect(limitIsFixedOnly({ autoLimit: false })).toBe(false)
  })

  it('shared: the household fixed total without a reserve', () => {
    expect(limitIsFixedOnly({ shared: true, sharedFixedTotal: 871.73, sharedReserve: 0, autoLimit: false })).toBe(true)
    expect(limitIsFixedOnly({ shared: true, sharedFixedTotal: 650, sharedReserve: 64.63, autoLimit: true })).toBe(false)
    expect(limitIsFixedOnly({ shared: true, sharedFixedTotal: 0, autoLimit: true })).toBe(false)
  })
})

describe('budgetSeverity and compareBudget', () => {
  it('only over and near tint a card', () => {
    expect(budgetSeverity(['planned', 'ok'])).toBe(null)
    expect(budgetSeverity(['planned', 'near'])).toBe('warning')
    expect(budgetSeverity(['near', 'over'])).toBe('red')
  })

  it('puts overruns first and planned last', () => {
    const rows = [
      { name: 'Poistenie', spent: 113.2, limit: 113.2, percentage: 100, fixed: true },
      { name: 'Jedlo', spent: 255, limit: 300, percentage: 85, fixed: false },
      { name: 'Zdravie', spent: 347.88, limit: 240, percentage: 145, fixed: false },
      { name: 'Doprava', spent: 50, limit: 125, percentage: 40, fixed: false },
    ]
    const sorted = [...rows].sort(compareBudget(r => budgetLevel(r.spent, r.limit, r.fixed)))
    expect(sorted.map(r => r.name)).toEqual(['Zdravie', 'Jedlo', 'Doprava', 'Poistenie'])
  })
})
