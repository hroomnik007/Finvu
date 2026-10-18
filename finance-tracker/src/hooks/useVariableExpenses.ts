import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getTransactions, createTransaction, updateTransaction, deleteTransaction } from '../api/transactions'
import { useAuth } from '../context/AuthContext'
import type { VariableExpense, ApiTransaction } from '../types'
import type { DataScope } from './useIncomes'

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
  try {
    const monthStr = month !== undefined && year !== undefined
      ? `${year}-${String(month).padStart(2, '0')}`
      : undefined
    const { data } = await getTransactions({ type: 'expense', isFixed: false, month: monthStr, limit: 200, scope })
    return data.map(toVariableExpense)
  } catch {
    return []
  }
}

export function useVariableExpenses(month?: number, year?: number, scope: DataScope = 'personal') {
  const { user } = useAuth()
  const qc = useQueryClient()

  const { data: variableExpenses = [] } = useQuery({
    queryKey: variableExpenseQueryKey(month, year, scope),
    queryFn: () => fetchVariableExpenses(month, year, scope),
    enabled: !!user,
  })

  const invalidate = useCallback(() => Promise.all([
    qc.invalidateQueries({ queryKey: ['variableExpenses'] }),
    qc.invalidateQueries({ queryKey: ['summaryCards'] }),
    qc.invalidateQueries({ queryKey: ['dashboardChart'] }),
  ]), [qc])

  const addVariableExpense = useCallback(async (expense: Omit<VariableExpense, 'id'>): Promise<void> => {
    await createTransaction({
      type: 'expense',
      amount: expense.amount,
      categoryId: expense.categoryId || null,
      description: expense.note,
      date: expense.date,
      isFixed: false,
    })
    await invalidate()
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
    await deleteTransaction(id)
    await invalidate()
  }, [invalidate])

  return { variableExpenses, addVariableExpense, updateVariableExpense, deleteVariableExpense }
}
