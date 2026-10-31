import { beforeEach, describe, expect, it, vi } from 'vitest'

// A failed request must reach React Query as an error (so the page shows
// "Nepodarilo sa načítať" + "Skúsiť znova"), not be swallowed into [] which
// looks exactly like "no data yet".
const fail = () => Promise.reject(new Error('HTTP 500'))
const getTransactions = vi.fn()
const getCategories = vi.fn()
const getSavingsGoals = vi.fn()
vi.mock('../api/transactions', () => ({
  getTransactions: (...a: unknown[]) => getTransactions(...a),
  createTransaction: vi.fn(), updateTransaction: vi.fn(), deleteTransaction: vi.fn(),
  changeFixedPrice: vi.fn(), endFixedSeries: vi.fn(),
}))
vi.mock('../api/categories', () => ({
  getCategories: () => getCategories(), createCategory: vi.fn(), updateCategory: vi.fn(), deleteCategory: vi.fn(),
}))
vi.mock('../api/savings', () => ({
  getSavingsGoals: () => getSavingsGoals(), createSavingsGoal: vi.fn(), updateSavingsGoal: vi.fn(),
  deleteSavingsGoal: vi.fn(), pauseSavingsGoal: vi.fn(), resumeSavingsGoal: vi.fn(),
}))

import { fetchIncomes } from './useIncomes'
import { fetchVariableExpenses } from './useVariableExpenses'
import { fetchFixedExpenses } from './useFixedExpenses'
import { fetchCategoriesData } from './useCategories'
import { fetchSavingsData } from './useSavings'

beforeEach(() => {
  getTransactions.mockReset().mockImplementation(fail)
  getCategories.mockReset().mockImplementation(fail)
  getSavingsGoals.mockReset().mockImplementation(fail)
})

describe('list fetchers propagate API errors', () => {
  it('incomes', async () => { await expect(fetchIncomes(5, 2026, null)).rejects.toThrow('HTTP 500') })
  it('variable expenses', async () => { await expect(fetchVariableExpenses(5, 2026)).rejects.toThrow('HTTP 500') })
  it('fixed expenses', async () => { await expect(fetchFixedExpenses(5, 2026, null)).rejects.toThrow('HTTP 500') })
  it('categories', async () => { await expect(fetchCategoriesData()).rejects.toThrow('HTTP 500') })
  it('savings', async () => { await expect(fetchSavingsData()).rejects.toThrow('HTTP 500') })
})

describe('real empty data still resolves to []', () => {
  it('returns [] when the API answers with no rows', async () => {
    getTransactions.mockResolvedValue({ data: [] })
    getCategories.mockResolvedValue({ data: [] })
    getSavingsGoals.mockResolvedValue({ data: [] })
    expect(await fetchVariableExpenses(5, 2026)).toEqual([])
    expect(await fetchCategoriesData()).toEqual([])
    expect(await fetchSavingsData()).toEqual([])
  })
})
