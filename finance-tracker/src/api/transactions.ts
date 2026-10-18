import { apiClient } from './client'
import type { ApiTransaction, ApiSummary } from '../types'
import { announceAchievementUnlocks } from '../utils/achievementEvents'
import { announceNotificationsRefresh } from '../utils/notificationEvents'

export interface TransactionParams {
  month?: string
  type?: 'income' | 'expense'
  isFixed?: boolean
  limit?: number
  offset?: number
  /** 'family' also returns the other sharing household members' rows. */
  scope?: 'personal' | 'family'
}

export interface TransactionPayload {
  categoryId?: string | null
  type: 'income' | 'expense'
  amount: number
  description?: string
  date: string
  isFixed?: boolean
}

export async function getTransactions(
  params: TransactionParams = {}
): Promise<{ data: ApiTransaction[]; total: number }> {
  const query: Record<string, string> = {}
  if (params.month) query.month = params.month
  if (params.type) query.type = params.type
  if (params.isFixed !== undefined) query.isFixed = String(params.isFixed)
  if (params.limit !== undefined) query.limit = String(params.limit)
  if (params.offset !== undefined) query.offset = String(params.offset)
  if (params.scope === 'family') query.scope = 'family'

  const { data } = await apiClient.get('/api/transactions', { params: query })
  return data
}

export async function createTransaction(
  payload: TransactionPayload
): Promise<{ data: ApiTransaction }> {
  const { data } = await apiClient.post('/api/transactions', payload)
  announceAchievementUnlocks(data.newlyUnlockedAchievements)
  // A new transaction (income, expense, fixed expense) can generate a budget,
  // fixedDue or income notification — refresh the bell without waiting for
  // the periodic poll.
  announceNotificationsRefresh()
  return data
}

export async function createTransactionsBulk(
  items: Omit<TransactionPayload, 'isFixed'>[]
): Promise<{ created: number }> {
  const { data } = await apiClient.post('/api/transactions/bulk', { items })
  announceAchievementUnlocks(data.newlyUnlockedAchievements)
  announceNotificationsRefresh()
  return data
}

export async function bulkSetTransactionCategory(ids: string[], categoryId: string | null): Promise<{ updated: number }> {
  const { data } = await apiClient.patch('/api/transactions/bulk', { ids, categoryId })
  return data
}

export async function bulkDeleteTransactions(ids: string[]): Promise<{ deleted: number }> {
  const { data } = await apiClient.post('/api/transactions/bulk-delete', { ids })
  announceNotificationsRefresh()
  return data
}

/** Indexes of the rows that already exist (same date, type and amount). */
export async function findDuplicateRows(items: { date: string; type: 'income' | 'expense'; amount: number }[]): Promise<number[]> {
  const { data } = await apiClient.post('/api/transactions/duplicates', { items })
  return (data as { duplicates: number[] }).duplicates
}

export async function updateTransaction(
  id: string,
  payload: Partial<TransactionPayload>
): Promise<{ data: ApiTransaction }> {
  const { data } = await apiClient.put(`/api/transactions/${id}`, payload)
  return data
}

export async function deleteTransaction(id: string): Promise<void> {
  await apiClient.delete(`/api/transactions/${id}`)
}

export type BalanceScope = 'personal' | 'family'

export async function getSummary(month: string, scope: BalanceScope = 'personal'): Promise<ApiSummary> {
  const { data } = await apiClient.get('/api/transactions/summary', { params: { month, scope } })
  return data
}

export async function getTotalBalance(): Promise<{ totalIncome: number; totalExpenses: number; balance: number }> {
  const { data } = await apiClient.get('/api/reports/total-balance')
  return data
}

export async function getBalanceAtMonth(year: number, month: number, scope: BalanceScope = 'personal'): Promise<{ balance: number }> {
  const { data } = await apiClient.get('/api/transactions/balance-at-month', { params: { year, month, scope } })
  return data
}

export async function getSummaryCards(year: number, month: number, scope: BalanceScope = 'personal'): Promise<{ balance: number; income: number; expenses: number; savingsRate: number }> {
  const { data } = await apiClient.get('/api/transactions/summary-cards', { params: { year, month, scope } })
  return data
}
