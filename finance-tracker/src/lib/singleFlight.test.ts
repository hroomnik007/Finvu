import { describe, it, expect, vi } from 'vitest'
import { runSingleFlight } from './singleFlight'

function deferred() {
  let resolve!: () => void
  let reject!: (e: unknown) => void
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('runSingleFlight (double-submit guard)', () => {
  it('ignores a second submit while the first is pending (double tap)', async () => {
    const flag = { current: false }
    const d = deferred()
    const save = vi.fn(() => d.promise)
    const first = runSingleFlight(flag, save)
    const second = runSingleFlight(flag, save)
    const third = runSingleFlight(flag, save)
    expect(save).toHaveBeenCalledTimes(1)
    expect(await second).toBeUndefined()
    expect(await third).toBeUndefined()
    d.resolve()
    await first
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('allows a new submit once the previous one finished', async () => {
    const flag = { current: false }
    const save = vi.fn(async () => 'ok')
    expect(await runSingleFlight(flag, save)).toBe('ok')
    expect(await runSingleFlight(flag, save)).toBe('ok')
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('releases the guard after an error so the user can retry', async () => {
    const flag = { current: false }
    const failing = vi.fn(async () => { throw new Error('500') })
    await expect(runSingleFlight(flag, failing)).rejects.toThrow('500')
    expect(flag.current).toBe(false)
    const ok = vi.fn(async () => 1)
    expect(await runSingleFlight(flag, ok)).toBe(1)
  })

  it('reports busy on start and idle on finish', async () => {
    const flag = { current: false }
    const busy: boolean[] = []
    await runSingleFlight(flag, async () => {}, b => busy.push(b))
    expect(busy).toEqual([true, false])
  })

  it('sets the flag synchronously, before the first await', () => {
    const flag = { current: false }
    void runSingleFlight(flag, () => new Promise(() => {}))
    expect(flag.current).toBe(true)
  })
})
