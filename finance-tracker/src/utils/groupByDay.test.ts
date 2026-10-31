import { describe, expect, it } from 'vitest'
import { groupByDay, signedAmount } from './groupByDay'

type R = { id: number; date: string; amount: number; type: 'income' | 'expense' }
const s = (r: R) => (r.type === 'income' ? r.amount : -r.amount)

describe('groupByDay', () => {
  it('groups by date prefix keeping first-seen order', () => {
    const rows: R[] = [
      { id: 1, date: '2026-10-18', amount: 10, type: 'expense' },
      { id: 2, date: '2026-10-17T10:00:00Z', amount: 5, type: 'expense' },
      { id: 3, date: '2026-10-18', amount: 2.5, type: 'expense' },
    ]
    const g = groupByDay(rows, r => r.date, s)
    expect(g.map(x => x.date)).toEqual(['2026-10-18', '2026-10-17'])
    expect(g[0].items.map(r => r.id)).toEqual([1, 3])
    expect(g[0].total).toBe(-12.5)
  })
  it('nets income and expenses without float drift', () => {
    const rows: R[] = [
      { id: 1, date: '2026-10-01', amount: 0.1, type: 'income' },
      { id: 2, date: '2026-10-01', amount: 0.2, type: 'income' },
      { id: 3, date: '2026-10-01', amount: 0.05, type: 'expense' },
    ]
    expect(groupByDay(rows, r => r.date, s)[0].total).toBe(0.25)
  })
  it('returns [] for no items', () => {
    expect(groupByDay([], () => '', () => 0)).toEqual([])
  })
})

describe('signedAmount', () => {
  const f = (n: number) => `${n.toFixed(2)} €`
  it('uses U+2212 for negatives and + otherwise', () => {
    expect(signedAmount(-3, f)).toBe('\u22123.00 €')
    expect(signedAmount(3, f)).toBe('+3.00 €')
    expect(signedAmount(0, f)).toBe('+0.00 €')
  })
})
