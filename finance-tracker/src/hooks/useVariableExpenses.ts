import { useCallback, useMemo } from 'react'
import { usePendingDeleteIds } from './useUndoableDelete'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createTransaction, updateTransaction, deleteTransaction } from '../api/transactions'
import { useAuth } from '../context/AuthContext'
import type { VariableExpense, ApiTransaction } from '../types'
import type { DataScope } from './useIncomes'
import { getAllTransactions } from '../api/allTransactions'
import { createOrQueue, isQueuedId, removeQueued } from '../lib/offlineQueue'
import { useOfflineQueue } from './useOfflineQueue'
import { queuedVariableRows } from '../utils/queuedRows'

function toVariableExpense(t: ApiTransaction): VariableExpense {
  return {
    id: t.id,
    amount: t.amount,
    categoryId: t.categoryId ?? '',
    note: t.description ?? '',
    date: t.date,
    created_by: t.created_by ?? null,
    categoryName: t.categoryName,
    categoryColor: t.categoryColor,
    categoryIcon: t.categoryIcon,
  }
}

export function variableExpenseQueryKey(month: number | undefined, year: number | undefined, scope: DataScope = 'personal') {
  const monthStr = month !== undefined && year !== undefined
    ? `${year}-${String(month).padStart(2, '0')}`
    : null
  return scope === 'family'
    ? ['variableExpenses', monthStr, 'family'] as const
    : ['variableExpenses', monthStr] as const
}

export async function fetchVariableExpenses(month?: number, year?: number, scope: DataScope = 'personal'): Promise<VariableExpense[]> {
  // Errors propagate so the page can show an error + retry instead of "no data".
  const monthStr = month !== undefined && year !== undefined
    ? `${year}-${String(month).padStart(2, '0')}`
    : undefined
  const data = await getAllTransactions({ type: 'expense', isFixed: false, month: monthStr, scope })
  return data.map(toVariableExpense)
}

export function useVariableExpenses(month?: number, year?: number, scope: DataScope = 'personal') {
  const { user } = useAuth()
  const qc = useQueryClient()

  const { data: variableExpensesAll, isLoading, isError, refetch } = useQuery({
    queryKey: variableExpenseQueryKey(month, year, scope),
    queryFn: () => fetchVariableExpenses(month, year, scope),
    enabled: !!user,
  })
  // Rows waiting in the delete-undo window are hidden (lib/pendingDelete).
  const hidden = usePendingDeleteIds()
  // Offline adds waiting to be sent show up first, marked `pending` (personal view only).
  const queue = useOfflineQueue()
  const monthKey = variableExpenseQueryKey(month, year)[1]
  const variableExpenses = useMemo(
    () => [...(scope === 'personal' ? queuedVariableRows(queue, monthKey) : []), ...(variableExpensesAll ?? [])]
      .filter(r => !r.id || !hidden.has(r.id)),
    [variableExpensesAll, hidden, queue, monthKey, scope],
  )


  const invalidate = useCallback(() => Promise.all([
    qc.invalidateQueries({ queryKey: ['variableExpenses'] }),
    qc.invalidateQueries({ queryKey: ['summaryCards'] }),
    qc.invalidateQueries({ queryKey: ['dashboardChart'] }),
    qc.invalidateQueries({ queryKey: ['monthlySeries'] }),
  ]), [qc])

  const addVariableExpense = useCallback(async (expense: Omit<VariableExpense, 'id'>): Promise<string> => {
    const { id, queued } = await createOrQueue({
      type: 'expense',
      amount: expense.amount,
      categoryId: expense.categoryId || null,
      description: expense.note,
      date: expense.date,
      isFixed: false,
    }, createTransaction)
    if (!queued) await invalidate()
    return id
  }, [invalidate])

  const updateVariableExpense = useCallback(async (id: string, changes: Partial<VariableExpense>): Promise<void> => {
    await updateTransaction(id, {
      amount: changes.amount,
      categoryId: changes.categoryId ?? null,
      description: changes.note,
      date: changes.date,
    })
    await invalidate()
  }, [invalidate])

  const deleteVariableExpense = useCallback(async (id: string): Promise<void> => {
    if (isQueuedId(id)) { removeQueued(id); return }
    await deleteTransaction(id)
    await invalidate()
  }, [invalidate])

  return { variableExpenses, isLoading, isError, refetch, addVariableExpense, updateVariableExpense, deleteVariableExpense }
}
