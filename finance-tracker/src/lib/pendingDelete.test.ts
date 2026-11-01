import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPendingDeletes, getPendingDeletes, resetPendingDeletes, scheduleDelete, subscribePendingDeletes } from './pendingDelete'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { resetPendingDeletes(); vi.useRealTimers() })

describe('pendingDelete (delayed delete with undo)', () => {
  it('hides the id at once and commits only after the window', async () => {
    const commit = vi.fn(async () => {})
    scheduleDelete('a', commit, { delay: 5000 })
    expect(getPendingDeletes().has('a')).toBe(true)
    await vi.advanceTimersByTimeAsync(4999)
    expect(commit).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(commit).toHaveBeenCalledTimes(1)
    expect(getPendingDeletes().has('a')).toBe(false)
  })

  it('undo cancels the request and shows the row again', async () => {
    const commit = vi.fn(async () => {})
    const undo = scheduleDelete('a', commit)
    expect(undo()).toBe(true)
    expect(getPendingDeletes().has('a')).toBe(false)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(commit).not.toHaveBeenCalled()
    expect(undo()).toBe(false)
  })

  it('undo after the delete started reports false', async () => {
    let resolve!: () => void
    const commit = vi.fn(() => new Promise<void>(r => { resolve = r }))
    const undo = scheduleDelete('a', commit, { delay: 10 })
    await vi.advanceTimersByTimeAsync(10)
    expect(commit).toHaveBeenCalled()
    // still hidden while the request is in flight
    expect(getPendingDeletes().has('a')).toBe(true)
    expect(undo()).toBe(false)
    resolve(); await vi.runAllTimersAsync()
    expect(getPendingDeletes().has('a')).toBe(false)
  })

  it('a failed commit calls onError and un-hides the row', async () => {
    const onError = vi.fn()
    scheduleDelete('a', async () => { throw new Error('500') }, { delay: 10, onError })
    await vi.advanceTimersByTimeAsync(10)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(getPendingDeletes().has('a')).toBe(false)
  })

  it('flush sends all waiting deletes now', async () => {
    const a = vi.fn(async () => {}), b = vi.fn(async () => {})
    scheduleDelete('a', a); scheduleDelete('b', b)
    await flushPendingDeletes()
    expect(a).toHaveBeenCalledTimes(1); expect(b).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(a).toHaveBeenCalledTimes(1)
  })

  it('notifies subscribers with a new snapshot', () => {
    const l = vi.fn(); const off = subscribePendingDeletes(l)
    const before = getPendingDeletes()
    const undo = scheduleDelete('a', async () => {})
    expect(l).toHaveBeenCalled(); expect(getPendingDeletes()).not.toBe(before)
    undo(); off()
  })
})
