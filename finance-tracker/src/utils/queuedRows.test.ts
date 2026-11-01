import { describe, expect, it } from 'vitest'
import { queuedFixedRows, queuedIncomeRows, queuedItemLabel, queuedVariableRows, rowActions } from './queuedRows'
import type { QueuedCreate } from '../lib/offlineQueue'
import { parseDescription } from '../hooks/useFixedExpenses'

const q = (key: string, payload: QueuedCreate['payload'], status: QueuedCreate['status'] = 'pending'): QueuedCreate =>
  ({ key, payload, queuedAt: 0, attempts: 0, status })

const queue: QueuedCreate[] = [
  q('k1', { type: 'expense', amount: 5, date: '2026-11-02', description: 'Káva', isFixed: false, categoryId: 'c1' }),
  q('k2', { type: 'expense', amount: 7, date: '2026-10-30', description: 'Starý', isFixed: false }),
  q('k3', { type: 'income', amount: 900, date: '2026-10-05', description: 'Výplata', isFixed: true }, 'failed'),
  q('k4', { type: 'income', amount: 20, date: '2026-10-05', description: 'Bonus', isFixed: false }),
  q('k5', { type: 'expense', amount: 30, date: '2026-11-01', description: JSON.stringify({ l: 'Netflix', n: '', d: 12 }), isFixed: true }),
]

describe('queued rows', () => {
  it('variable expenses of the viewed month, with queued ids and state', () => {
    expect(queuedVariableRows(queue, '2026-11')).toEqual([
      { id: 'queued:k1', amount: 5, categoryId: 'c1', note: 'Káva', date: '2026-11-02', pending: 'pending' },
    ])
    expect(queuedVariableRows(queue, null)).toHaveLength(2)
  })
  it('recurring incomes carry into later months; one-offs stay in their month', () => {
    expect(queuedIncomeRows(queue, '2026-11').map(r => [r.id, r.pending])).toEqual([['queued:k3', 'failed']])
    expect(queuedIncomeRows(queue, '2026-10')).toHaveLength(2)
    expect(queuedIncomeRows(queue, '2026-09')).toHaveLength(0)
  })
  it('fixed bills decode their label and due day', () => {
    expect(queuedFixedRows(queue, '2026-11', parseDescription)).toMatchObject([{ id: 'queued:k5', label: 'Netflix', dayOfMonth: 12, amount: 30 }])
    expect(queuedFixedRows(queue, '2026-10', parseDescription)).toEqual([])
    expect(queuedItemLabel(queue[4])).toBe('Netflix')
    expect(queuedItemLabel(queue[0])).toBe('Káva')
  })
  it('queued rows can only be discarded; offline rows are read-only', () => {
    expect(rowActions({}, false)).toEqual({ canEdit: true, canDelete: true })
    expect(rowActions({}, true)).toEqual({ canEdit: false, canDelete: false })
    expect(rowActions({ pending: 'pending' }, false)).toEqual({ canEdit: false, canDelete: true })
    expect(rowActions({ pending: 'failed' }, true)).toEqual({ canEdit: false, canDelete: true })
  })
})
