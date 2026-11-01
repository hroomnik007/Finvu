// Turns queued offline creates into list rows so a just-added item shows up
// at once with a "waiting to send" badge (see lib/offlineQueue).
import type { QueuedCreate } from '../lib/offlineQueue'
import { queuedId } from '../lib/offlineQueue'
import type { FixedExpense, Income, VariableExpense } from '../types'

const ym = (date: string) => date.substring(0, 7)

export function queuedVariableRows(queue: readonly QueuedCreate[], monthStr: string | null): VariableExpense[] {
  return queue
    .filter(q => q.payload.type === 'expense' && !q.payload.isFixed && (!monthStr || ym(q.payload.date) === monthStr))
    .map(q => ({
      id: queuedId(q.key),
      amount: q.payload.amount,
      categoryId: q.payload.categoryId ?? '',
      note: q.payload.description ?? '',
      date: q.payload.date,
      pending: q.status,
    }))
}

export function queuedIncomeRows(queue: readonly QueuedCreate[], monthStr: string | null): Income[] {
  return queue
    .filter(q => q.payload.type === 'income')
    .filter(q => !monthStr || (q.payload.isFixed ? ym(q.payload.date) <= monthStr : ym(q.payload.date) === monthStr))
    .map(q => ({
      id: queuedId(q.key),
      amount: q.payload.amount,
      label: q.payload.description ?? '',
      date: q.payload.date,
      recurring: !!q.payload.isFixed,
      pending: q.status,
    }))
}

export function queuedFixedRows(
  queue: readonly QueuedCreate[],
  monthStr: string | null,
  decode: (desc: string | null, fallbackDay: number) => { label: string; note: string; dayOfMonth: number },
): FixedExpense[] {
  return queue
    .filter(q => q.payload.type === 'expense' && q.payload.isFixed && (!monthStr || ym(q.payload.date) <= monthStr))
    .map(q => {
      const d = decode(q.payload.description ?? null, Number(q.payload.date.substring(8, 10)) || 1)
      return {
        id: queuedId(q.key),
        label: d.label,
        note: d.note,
        dayOfMonth: d.dayOfMonth,
        amount: q.payload.amount,
        categoryId: q.payload.categoryId ?? null,
        endedOn: null,
        pending: q.status,
      }
    })
}

/** Human label of a queued create (fixed bills keep their name in JSON). */
export function queuedItemLabel(q: QueuedCreate): string {
  const d = q.payload.description ?? ''
  if (q.payload.isFixed && q.payload.type === 'expense') {
    try { const o = JSON.parse(d); if (o && typeof o.l === 'string') return o.l } catch { /* plain text */ }
  }
  return d || q.payload.date
}

/**
 * What a row allows: queued rows cannot be edited (only discarded), and
 * server rows cannot be edited or deleted while offline.
 */
export function rowActions(row: { pending?: 'pending' | 'failed' }, offline: boolean): { canEdit: boolean; canDelete: boolean } {
  return { canEdit: !offline && !row.pending, canDelete: !!row.pending || !offline }
}
