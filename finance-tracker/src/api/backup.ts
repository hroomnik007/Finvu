import { apiClient } from './client'

export interface RestoreCounts {
  categories: number
  categoryRules: number
  transactions: number
  savingsGoals: number
  savingsDeposits: number
  skippedTransactions: number
}

/** The user's whole backup as plain JSON; the caller encrypts it before saving. */
export async function fetchBackup(): Promise<unknown> {
  const { data } = await apiClient.get('/api/backup')
  return data
}

export async function restoreBackup(backup: unknown, mode: 'replace' | 'merge'): Promise<RestoreCounts> {
  const { data } = await apiClient.post('/api/backup/restore', { mode, backup })
  return (data as { data: RestoreCounts }).data
}
