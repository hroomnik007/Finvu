import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createTransaction, updateTransaction, deleteTransaction, changeFixedPrice, endFixedSeries } from '../api/transactions'
import { useAuth } from '../context/AuthContext'
import { isEndedInMonth, isNewerRow } from './useFixedExpenses'
import type { Income, ApiTransaction } from '../types'
import { getAllTransactions } from '../api/allTransactions'

function adjustDateToMonth(originalDate: string, targetMonth: number, targetYear: number): string {
  const originalDay = parseInt(originalDate.split('-')[2], 10)
  const daysInTarget = new Date(targetYear, targetMonth, 0).getDate()
  const day = Math.min(originalDay, daysInTarget)
  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function toIncome(t: ApiTransaction): Income {
  return {
    id: t.id,
    amount: t.amount,
    label: t.description ?? '',
    date: t.date,
    recurring: t.isFixed,
    endedOn: t.endedOn ?? null,
    created_by: t.created_by ?? null,
  }
}

export type DataScope = 'personal' | 'family'

// The scope is part of the key only for the family view, so existing
// personal-scope keys (prefetch, invalidation by ['incomes'] prefix) are unchanged.
export function incomeQueryKey(month: number | undefined, year: number | undefined, trackingStart: string | null | undefined, scope: DataScope = 'personal') {
  const monthStr = month !== undefined && year !== undefined
    ? `${year}-${String(month).padStart(2, '0')}`
    : null
  return scope === 'family'
    ? ['incomes', monthStr, trackingStart ?? null, 'family'] as const
    : ['incomes', monthStr, trackingStart ?? null] as const
}

export async function fetchIncomes(
  month: number | undefined,
  year: number | undefined,
  trackingStart: string | null | undefined,
  scope: DataScope = 'personal',
): Promise<Income[]> {
  // Errors propagate so the page can show an error + retry instead of "no data".
  const monthStr = month !== undefined && year !== undefined
    ? `${year}-${String(month).padStart(2, '0')}`
    : undefined
  const data = await getAllTransactions({ type: 'income', month: monthStr, scope })

  if (monthStr) {
    const trackingYM = trackingStart ? trackingStart.substring(0, 7) : null
    if (trackingYM && monthStr < trackingYM) {
      return data.filter(t => !t.isFixed).map(toIncome)
    }
    // No month filter here by design: a recurring income created in any past
    // month must appear in every subsequent month. The backend month param
    // filters by creation date, not recurrence — adding it would hide older
    // recurring incomes. Client-side filter on line below enforces t.date <= monthStr.
    const recurring = await getAllTransactions({ type: 'income', isFixed: true, scope })
    // A recurring income is a series (same owner and description): only its
    // latest price dated up to this month counts, and only while not ended.
    const latest = new Map<string, ApiTransaction>()
    for (const t of recurring) {
      if (t.date.substring(0, 7) > monthStr) continue
      if (trackingYM && t.date.substring(0, 7) < trackingYM) continue
      // Same series key and same-date tie-break as the backend cards and
      // household stats (owner + description, later-created row wins).
      const key = `${t.userId}|${t.description ?? ''}`
      const cur = latest.get(key)
      if (!cur || isNewerRow(t, cur)) latest.set(key, t)
    }
    const extra = [...latest.values()]
      .filter(t => !isEndedInMonth(t.endedOn, monthStr))
      .map(t => t.date.substring(0, 7) !== monthStr
        ? { ...t, date: adjustDateToMonth(t.date, month!, year!) }
        : t
      )
    return [...data.filter(t => !t.isFixed), ...extra].map(toIncome)
  }
  return data.map(toIncome)
}

export function useIncomes(month?: number, year?: number, scope: DataScope = 'personal') {
  const { user } = useAuth()
  const qc = useQueryClient()
  const qKey = incomeQueryKey(month, year, user?.tracking_start_date, scope)

  const { data: incomes = [], isLoading, isError, refetch } = useQuery({
    queryKey: qKey,
    queryFn: () => fetchIncomes(month, year, user?.tracking_start_date, scope),
    enabled: !!user,
  })

  const invalidate = useCallback(() => Promise.all([
    qc.invalidateQueries({ queryKey: ['incomes'] }),
    qc.invalidateQueries({ queryKey: ['summaryCards'] }),
    qc.invalidateQueries({ queryKey: ['dashboardChart'] }),
  ]), [qc])

  const addIncome = useCallback(async (income: Omit<Income, 'id'>): Promise<string> => {
    const { data } = await createTransaction({
      type: 'income',
      amount: income.amount,
      description: income.label,
      date: income.date,
      isFixed: income.recurring,
    })
    await invalidate()
    return data.id
  }, [invalidate])

  const updateIncome = useCallback(async (id: string, changes: Partial<Income>): Promise<void> => {
    await updateTransaction(id, {
      amount: changes.amount,
      description: changes.label,
      date: changes.date,
      isFixed: changes.recurring,
    })
    await invalidate()
  }, [invalidate])

  const changeIncomePrice = useCallback(async (id: string, amount: number, from: string): Promise<void> => {
    await changeFixedPrice(id, amount, from)
    await invalidate()
  }, [invalidate])

  const endIncome = useCallback(async (id: string, lastMonth: string | null): Promise<void> => {
    await endFixedSeries(id, lastMonth)
    await invalidate()
  }, [invalidate])

  const deleteIncome = useCallback(async (id: string): Promise<void> => {
    await deleteTransaction(id)
    await invalidate()
  }, [invalidate])

  return { incomes, isLoading, isError, refetch, addIncome, updateIncome, deleteIncome, changeIncomePrice, endIncome }
}
