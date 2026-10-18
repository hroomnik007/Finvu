import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiTransaction } from '../types'

const getTransactions = vi.fn()
vi.mock('./transactions', () => ({ getTransactions: (...a: unknown[]) => getTransactions(...a) }))

import { getAllTransactions } from './allTransactions'

const rows = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ id: String(from + i) }) as ApiTransaction)

beforeEach(() => getTransactions.mockReset())

describe('getAllTransactions', () => {
  it('keeps fetching pages until a short one', async () => {
    getTransactions
      .mockResolvedValueOnce({ data: rows(200), total: 450 })
      .mockResolvedValueOnce({ data: rows(200, 200), total: 450 })
      .mockResolvedValueOnce({ data: rows(50, 400), total: 450 })
    const all = await getAllTransactions({ type: 'expense', isFixed: true })
    expect(all).toHaveLength(450)
    expect(getTransactions).toHaveBeenCalledTimes(3)
    expect(getTransactions.mock.calls.map(c => c[0].offset)).toEqual([0, 200, 400])
    expect(getTransactions.mock.calls[0][0]).toMatchObject({ type: 'expense', isFixed: true, limit: 200 })
  })

  it('makes one request when everything fits', async () => {
    getTransactions.mockResolvedValueOnce({ data: rows(3), total: 3 })
    expect(await getAllTransactions({})).toHaveLength(3)
    expect(getTransactions).toHaveBeenCalledTimes(1)
  })
})
