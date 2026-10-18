import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getTransactions, createTransaction, updateTransaction, deleteTransaction } from '../api/transactions'
import { useAuth } from '../context/AuthContext'
import type { FixedExpense, ApiTransaction } from '../types'
import type { DataScope } from './useIncomes'

export function parseDescription(desc: string | null, fallbackDay: number): { label: string; note: string; dayOfMonth: number } {
  if (!desc) return { label: '', note: '', dayOfMonth: fallbackDay }
  try {
    const obj = JSON.parse(desc)
    if (obj && typeof obj === 'object' && 'l' in obj) {
      return {
        label: String(obj.l ?? ''),
        note: String(obj.n ?? ''),
        dayOfMonth: typeof obj.d === 'number' && obj.d >= 1 && obj.d <= 31 ? obj.d : fallbackDay,
      }
    }
  } catch { /* not JSON — legacy plain text */ }
  return { label: desc, note: '', dayOfMonth: fallbackDay }
}

function encodeDescription(label: string, note: string, dayOfMonth: number): string {
  return JSON.stringify({ l: label, n: note, d: dayOfMonth })
}

// A fixed expense only becomes "spent" once its due day in the viewed month
// has actually arrived — a bill due on the 10th shouldn't count toward
// totals on the 1st. Months fully in the past always count in full (their
// due day has necessarily passed); months in the future never count yet.
export function isFixedExpenseDue(dayOfMonth: number, month: number, year: number, today: Date = new Date()): boolean {
  const curMonth = today.getMonth() + 1
  const curYear = today.getFullYear()
  if (year !== curYear) return year < curYear
  if (month !== curMonth) return month < curMonth
  return dayOfMonth <= today.getDate()
}

function toFixedExpense(t: ApiTransaction): FixedExpense {
  const fallbackDay = t.date ? new Date(t.date + 'T12:00:00').getDate() : 1
  const parsed = parseDescription(t.description, fallbackDay)
  return {
    id: t.id,
    label: parsed.label,
    amount: t.amount,
    dayOfMonth: parsed.dayOfMonth,
    categoryId: t.categoryId ?? null,
    note: parsed.note,
    ownerId: t.userId,
    categoryName: t.categoryName,
    categoryColor: t.categoryColor,
    categoryIcon: t.categoryIcon,
  }
}

export function fixedExpenseQueryKey(month: number | undefined, year: number | undefined, trackingStart: string | null | undefined, scope: DataScope = 'personal') {
  const monthStr = month !== undefined && year !== undefined
    ? `${year}-${String(month).padStart(2, '0')}`
    : null
  return scope === 'family'
    ? ['fixedExpenses', monthStr, trackingStart ?? null, 'family'] as const
    : ['fixedExpenses', monthStr, trackingStart ?? null] as const
}

export async function fetchFixedExpenses(
  month: number | undefined,
  year: number | undefined,
  trackingStart: string | null | undefined,
  scope: DataScope = 'personal',
): Promise<FixedExpense[]> {
  try {
    const monthStr = month !== undefined && year !== undefined
      ? `${year}-${String(month).padStart(2, '0')}`
      : undefined
    const trackingYM = trackingStart ? trackingStart.substring(0, 7) : null
    // If tracking_start_date is set and the viewed month is before it, show no fixed expenses
    if (monthStr && trackingYM && monthStr < trackingYM) return []

    if (!monthStr) {
      const { data } = await getTransactions({ type: 'expense', isFixed: true, limit: 200, scope })
      return data.map(toFixedExpense)
    }

    // A fixed expense is entered once and recurs every month after that — the
    // backend `month` param filters by creation date, not recurrence, so it
    // would hide a bill created in an earlier month. No month filter is sent;
    // each distinct bill (keyed by its description) counts once for the viewed
    // month using its most recent occurrence at or before that month's end,
    // matching the dedup in the getSummaryCards backend endpoint.
    // TODO: paginate if a user accumulates >200 fixed expense records.
    const { data } = await getTransactions({ type: 'expense', isFixed: true, limit: 200, scope })
    if (data.length === 200) {
      console.warn('useFixedExpenses: fixed expense limit reached, some records may be missing')
    }
    const latestByIdentity = new Map<string, ApiTransaction>()
    for (const t of data) {
      if (t.date.substring(0, 7) > monthStr) continue
      if (trackingYM && t.date.substring(0, 7) < trackingYM) continue
      // Per owner: two members can both have a bill with the same label.
      const key = `${t.userId}|${t.description ?? ''}`
      const existing = latestByIdentity.get(key)
      if (!existing || t.date > existing.date) latestByIdentity.set(key, t)
    }
    return [...latestByIdentity.values()].map(toFixedExpense)
  } catch {
    return []
  }
}

export function useFixedExpenses(month?: number, year?: number, scope: DataScope = 'personal') {
  const { isAuthenticated, user } = useAuth()
  const qc = useQueryClient()
  const qKey = fixedExpenseQueryKey(month, year, user?.tracking_start_date, scope)

  const { data: fixedExpenses = [] } = useQuery({
    queryKey: qKey,
    queryFn: () => fetchFixedExpenses(month, year, user?.tracking_start_date, scope),
    enabled: isAuthenticated,
  })

  const invalidate = useCallback(() => Promise.all([
    qc.invalidateQueries({ queryKey: ['fixedExpenses'] }),
    qc.invalidateQueries({ queryKey: ['summaryCards'] }),
    qc.invalidateQueries({ queryKey: ['dashboardChart'] }),
  ]), [qc])

  const addFixedExpense = useCallback(async (expense: Omit<FixedExpense, 'id'>): Promise<void> => {
    const today = new Date().toISOString().split('T')[0]
    await createTransaction({
      type: 'expense',
      amount: expense.amount,
      description: encodeDescription(expense.label, expense.note, expense.dayOfMonth),
      date: today,
      isFixed: true,
      categoryId: expense.categoryId ?? null,
    })
    await invalidate()
  }, [invalidate])

  const updateFixedExpense = useCallback(async (id: string, changes: Partial<FixedExpense>): Promise<void> => {
    const current = qc.getQueryData<FixedExpense[]>(qKey) ?? []
    const existing = current.find(e => e.id === id)
    const label = changes.label ?? existing?.label ?? ''
    const note = changes.note ?? existing?.note ?? ''
    const dayOfMonth = changes.dayOfMonth ?? existing?.dayOfMonth ?? 1
    await updateTransaction(id, {
      amount: changes.amount,
      description: encodeDescription(label, note, dayOfMonth),
      categoryId: changes.categoryId !== undefined ? changes.categoryId : existing?.categoryId,
    })
    await invalidate()
  }, [qc, qKey, invalidate])

  const deleteFixedExpense = useCallback(async (id: string): Promise<void> => {
    await deleteTransaction(id)
    await invalidate()
  }, [invalidate])

  return { fixedExpenses, addFixedExpense, updateFixedExpense, deleteFixedExpense }
}
