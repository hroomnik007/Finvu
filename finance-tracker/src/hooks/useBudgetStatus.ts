import { useMemo } from 'react'
import type { Category, VariableExpense, FixedExpense, BudgetStatus } from '../types'
import { isFixedExpenseDue } from './useFixedExpenses'

interface UseBudgetStatusParams {
  categories: Category[]
  variableExpenses: VariableExpense[]
  fixedExpenses?: FixedExpense[]
  month?: number
  year?: number
  /**
   * Family view: a shared category has one common limit, so it is measured against
   * what every member spent in it (rows are paired by category name, because each
   * member's rows carry the id of their own copy). Other categories stay personal.
   */
  family?: boolean
}

const nameKey = (n?: string | null) => (n ?? '').trim().toLowerCase()

// The one place that turns expenses into "spent vs limit" — Dashboard and
// Categories both go through it, so the same inputs give the same percentage.
export function computeBudgetStatuses({ categories, variableExpenses, fixedExpenses = [], month, year, family = false }: UseBudgetStatusParams, now: Date = new Date()): BudgetStatus[] {
  const viewMonth = month ?? now.getMonth() + 1
  const viewYear = year ?? now.getFullYear()
  return categories
    .filter(c => c.budgetLimit !== undefined && c.budgetLimit > 0)
    .map(cat => {
      const byName = family && !!cat.shared
      const mine = (row: { categoryId?: string | null; categoryName?: string | null }) =>
        byName ? nameKey(row.categoryName) === nameKey(cat.name) : row.categoryId === cat.id
      const varSpent = variableExpenses
        .filter(mine)
        .reduce((sum, e) => sum + e.amount, 0)
      const fixedSpent = fixedExpenses
        .filter(f => mine(f) && isFixedExpenseDue(f.dayOfMonth, viewMonth, viewYear, now))
        .reduce((sum, f) => sum + f.amount, 0)
      const spent = varSpent + fixedSpent
      const limit = cat.budgetLimit!
      const percentage = (spent / limit) * 100
      return {
        categoryId: cat.id!,
        categoryName: cat.name,
        categoryIcon: cat.icon,
        categoryColor: cat.color,
        spent,
        limit,
        percentage,
        isWarning: percentage >= 70 && percentage < 90,
        isOver: percentage > 100,
      }
    })
}

export function useBudgetStatus({ categories, variableExpenses, fixedExpenses = [], month, year, family = false }: UseBudgetStatusParams): BudgetStatus[] {
  return useMemo(
    () => computeBudgetStatuses({ categories, variableExpenses, fixedExpenses, month, year, family }),
    [categories, variableExpenses, fixedExpenses, month, year, family],
  )
}
