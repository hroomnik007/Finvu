import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { useTranslation } from '../i18n'
import { fetchVariableExpenses, variableExpenseQueryKey } from './useVariableExpenses'
import { recentMonths, sortCategoriesByUsage } from '../utils/entryDefaults'
import type { Category } from '../types'

/**
 * Categories sorted for quick entry: most used in the last 3 months first
 * (from the user's own variable expenses — the same cached queries the
 * expense pages use), unused ones A–Z.
 */
export function useCategoriesByUsage(categories: Category[]): Category[] {
  const { user } = useAuth()
  const { locale } = useTranslation()
  const now = new Date()
  const months = recentMonths(now.getMonth() + 1, now.getFullYear(), 3)
  const results = useQueries({
    queries: months.map(([m, y]) => ({
      queryKey: variableExpenseQueryKey(m, y),
      queryFn: () => fetchVariableExpenses(m, y),
      enabled: !!user,
    })),
  })
  const usedIds = results.flatMap(r => (r.data ?? []).map(e => e.categoryId))
  const key = usedIds.join(',')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => sortCategoriesByUsage(categories, usedIds, locale), [categories, key, locale])
}
