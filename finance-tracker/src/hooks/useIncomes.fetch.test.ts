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

import { fetchIncomes } from './useIncomes'

const row = (over: Partial<ApiTransaction>): ApiTransaction => ({
  id: 'x', userId: 'u1', categoryId: null, type: 'income', amount: 2000, description: 'Plat',
  date: '2026-01-10', isFixed: true, createdAt: '', updatedAt: '', categoryName: null, categoryColor: null, categoryIcon: null,
  ...over,
})

function mockApi(recurring: ApiTransaction[], monthRows: ApiTransaction[] = []) {
  getTransactions.mockImplementation(async (p?: { isFixed?: boolean }) => ({ data: p?.isFixed ? recurring : monthRows }))
}

beforeEach(() => getTransactions.mockReset())

describe('fetchIncomes recurring series', () => {
  const salary = [row({ id: 'a' }), row({ id: 'b', amount: 2300, date: '2026-06-10' })]

  it('uses the price valid for the month', async () => {
    mockApi(salary)
    expect((await fetchIncomes(5, 2026, null))[0].amount).toBe(2000)
    const july = await fetchIncomes(7, 2026, null)
    expect(july).toHaveLength(1)
    expect(july[0].amount).toBe(2300)
  })

  it('drops a series from the month it ended', async () => {
    mockApi(salary.map(r => ({ ...r, endedOn: '2026-09-01' })))
    expect(await fetchIncomes(8, 2026, null)).toHaveLength(1)
    expect(await fetchIncomes(9, 2026, null)).toHaveLength(0)
  })
})
