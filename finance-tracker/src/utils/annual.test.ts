import { describe, expect, it } from 'vitest'
import { annualCsv, savingsRatePct, yearCategories, yearTotals } from './annual'
import type { SeriesMonth } from '../api/transactions'

const months: SeriesMonth[] = [
  { month: '2026-01', income: 2000, expense: 1500, categories: [{ name: 'Jedlo', color: '#1', type: 'expense', total: 500 }, { name: 'Plat', color: null, type: 'income', total: 2000 }] },
  { month: '2026-02', income: 2000, expense: 1000, categories: [{ name: ' jedlo', color: '#2', type: 'expense', total: 300 }, { name: '=SUM(A1)', color: null, type: 'expense', total: 50 }] },
]

describe('annual helpers', () => {
  it('totals the year and the rate of savings', () => {
    expect(yearTotals(months)).toEqual({ income: 4000, expense: 2500 })
    expect(savingsRatePct(4000, 2500)).toBe(38)
    expect(savingsRatePct(0, 10)).toBeNull()
  })

  it('merges same-named expense categories and leaves income out', () => {
    const cats = yearCategories(months)
    expect(cats[0]).toEqual({ name: 'Jedlo', color: '#1', total: 800 })
    expect(cats.some(c => c.name === 'Plat')).toBe(false)
  })

  it('exports a CSV with formula-looking cells defused', () => {
    const csv = annualCsv(2026, months, { month: 'Mesiac', income: 'Príjmy', expense: 'Výdavky', balance: 'Rozdiel', category: 'Kategória', amount: 'Suma', total: 'Spolu', monthNames: ['Január', 'Február'], noCategory: 'Bez kategórie' })
    expect(csv).toContain('"Január 2026",2000.00,1500.00,500.00')
    expect(csv).toContain('"Spolu",4000.00,2500.00,1500.00')
    expect(csv).toContain(`"'=SUM(A1)",50.00`)
  })
})
