import { describe, expect, it, vi } from 'vitest'
import type { ApiTransaction } from '../types'

vi.mock('../api/transactions', () => ({ getTransactions: vi.fn(), deleteTransaction: vi.fn() }))

import { DELETE_BATCH, deleteAllTransactions, type DeleteAllDeps } from './deleteAllTransactions'

function fake(total: number, failFor: (id: string, call: number) => unknown) {
  let store = Array.from({ length: total }, (_, i) => ({ id: `t${i}` }) as ApiTransaction)
  const calls = new Map<string, number>()
  let inFlight = 0
  let maxInFlight = 0
  const deps: DeleteAllDeps = {
    list: async () => store.slice(0, 200),
    remove: async id => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await Promise.resolve()
      inFlight--
      const n = (calls.get(id) ?? 0) + 1
      calls.set(id, n)
      const err = failFor(id, n)
      if (err) throw err
      store = store.filter(t => t.id !== id)
    },
    wait: async () => {},
  }
  return { deps, left: () => store.length, maxInFlight: () => maxInFlight }
}

const http = (status: number) => ({ response: { status } })

describe('deleteAllTransactions', () => {
  it('deletes all 450 even when some answers are 429, with at most 20 in flight', async () => {
    const f = fake(450, (id, call) => (Number(id.slice(1)) % 7 === 0 && call <= 2 ? http(429) : null))
    const r = await deleteAllTransactions(f.deps)
    expect(r).toEqual({ deleted: 450, failed: 0 })
    expect(f.left()).toBe(0)
    expect(f.maxInFlight()).toBeLessThanOrEqual(DELETE_BATCH)
  })

  it('stops on a persistent error and reports how many stayed', async () => {
    const f = fake(450, () => http(500))
    const r = await deleteAllTransactions(f.deps)
    expect(r).toEqual({ deleted: 0, failed: 200 })
    expect(f.left()).toBe(450)
  })
})
