import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiTransaction } from '../types'

const getTransactions = vi.fn()
vi.mock('../api/transactions', () => ({
  getTransactions: (...a: unknown[]) => getTransactions(...a),
  createTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  changeFixedPrice: vi.fn(),
  endFixedSeries: vi.fn(),
}))

import { fetchFixedExpenses, isEndedInMonth } from './useFixedExpenses'

const desc = JSON.stringify({ l: 'Nájom', n: '', d: 5 })
const row = (over: Partial<ApiTransaction>): ApiTransaction => ({
  id: 'x', userId: 'u1', categoryId: 'c1', type: 'expense', amount: 650, description: desc,
  date: '2026-01-05', isFixed: true, createdAt: '', updatedAt: '', categoryName: null, categoryColor: null, categoryIcon: null,
  ...over,
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 15, 12)) // 15 Oct 2026
  getTransactions.mockReset()
})

describe('isEndedInMonth', () => {
  it('an item ended on 1 Oct 2026 still applies in September but not in October', () => {
    expect(isEndedInMonth('2026-10-01', '2026-09')).toBe(false)
    expect(isEndedInMonth('2026-10-01', '2026-10')).toBe(true)
    expect(isEndedInMonth(null, '2030-01')).toBe(false)
  })
})

describe('fetchFixedExpenses', () => {
  const rent = [
    row({ id: 'a', date: '2026-01-05', amount: 650 }),
    row({ id: 'b', date: '2026-09-01', amount: 700 }),
  ]

  it('shows each series once at its current price with the price history', async () => {
    getTransactions.mockResolvedValue({ data: rent })
    const result = await fetchFixedExpenses(undefined, undefined, null)
    expect(result).toHaveLength(1)
    expect(result[0].amount).toBe(700)
    expect(result[0].history).toEqual([{ from: '2026-01', amount: 650 }, { from: '2026-09', amount: 700 }])
  })

  it('uses the old price for months before the change', async () => {
    getTransactions.mockResolvedValue({ data: rent })
    const aug = await fetchFixedExpenses(8, 2026, null)
    expect(aug.map(e => e.amount)).toEqual([650])
    const sep = await fetchFixedExpenses(9, 2026, null)
    expect(sep.map(e => e.amount)).toEqual([700])
  })

  it('does not take a price change dated in the future as the current price', async () => {
    getTransactions.mockResolvedValue({ data: [...rent, row({ id: 'c', date: '2026-12-01', amount: 750 })] })
    const now = await fetchFixedExpenses(undefined, undefined, null)
    expect(now[0].amount).toBe(700)
    expect(now[0].history?.at(-1)).toEqual({ from: '2026-12', amount: 750 })
  })

  it('hides ended series from "now" and from later months unless asked for', async () => {
    const ended = rent.map(r => ({ ...r, endedOn: '2026-10-01' }))
    getTransactions.mockResolvedValue({ data: ended })
    expect(await fetchFixedExpenses(undefined, undefined, null)).toHaveLength(0)
    expect(await fetchFixedExpenses(undefined, undefined, null, 'personal', true)).toHaveLength(1)
    expect(await fetchFixedExpenses(9, 2026, null)).toHaveLength(1)
    expect(await fetchFixedExpenses(10, 2026, null)).toHaveLength(0)
  })
})

describe('fetchFixedExpenses vs tracking start', () => {
  it('a bill dated before the start counts from the start month on', async () => {
    getTransactions.mockResolvedValue({ data: [row({ id: 'r', date: '2026-01-05', amount: 650 })] })
    expect(await fetchFixedExpenses(3, 2026, '2026-04-01')).toEqual([])
    const may = await fetchFixedExpenses(5, 2026, '2026-04-01')
    expect(may).toHaveLength(1)
    expect(may[0].amount).toBe(650)
  })
})
