import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { showToast, getToasts, dismissToast, runToastAction, resetToasts, subscribeToasts } from './toastStore'
import { saveFeedback } from './saveFeedback'

const texts = { saved: 'Uložené', saveFailed: 'Nepodarilo sa uložiť.', undo: 'Späť', undone: 'Vrátené späť', undoFailed: 'Nepodarilo sa vrátiť späť.' }

describe('toastStore', () => {
  beforeEach(() => { vi.useFakeTimers(); resetToasts() })
  afterEach(() => { vi.useRealTimers() })

  it('shows and auto-dismisses a toast after 4 s', () => {
    const listener = vi.fn()
    const unsub = subscribeToasts(listener)
    showToast('Ahoj')
    expect(getToasts().map(t => t.message)).toEqual(['Ahoj'])
    expect(listener).toHaveBeenCalled()
    vi.advanceTimersByTime(3999)
    expect(getToasts()).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(getToasts()).toHaveLength(0)
    unsub()
  })

  it('keeps a toast with an action longer (6 s)', () => {
    showToast('x', { action: { label: 'Späť', onAction: () => {} } })
    vi.advanceTimersByTime(5000)
    expect(getToasts()).toHaveLength(1)
    vi.advanceTimersByTime(1000)
    expect(getToasts()).toHaveLength(0)
  })

  it('runs an action at most once and removes the toast', async () => {
    const onAction = vi.fn()
    const id = showToast('x', { action: { label: 'Späť', onAction } })
    await Promise.all([runToastAction(id), runToastAction(id)])
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(getToasts()).toHaveLength(0)
  })

  it('dismissToast is a no-op for unknown ids', () => {
    showToast('a')
    dismissToast(999)
    expect(getToasts()).toHaveLength(1)
  })
})

describe('saveFeedback', () => {
  beforeEach(() => { vi.useFakeTimers(); resetToasts() })
  afterEach(() => { vi.useRealTimers() })

  it('shows "Uložené" without undo for edits', () => {
    saveFeedback.saved(texts)
    const [toast] = getToasts()
    expect(toast.message).toBe('Uložené')
    expect(toast.variant).toBe('success')
    expect(toast.action).toBeUndefined()
  })

  it('"Späť" deletes the created item and confirms', async () => {
    const undo = vi.fn(async () => {})
    const id = saveFeedback.saved(texts, undo)
    expect(getToasts()[0].action?.label).toBe('Späť')
    await runToastAction(id)
    expect(undo).toHaveBeenCalledTimes(1)
    expect(getToasts().map(t => t.message)).toEqual(['Vrátené späť'])
  })

  it('shows an error toast when undo fails', async () => {
    const id = saveFeedback.saved(texts, async () => { throw new Error('network') })
    await runToastAction(id)
    const [toast] = getToasts()
    expect(toast.message).toBe('Nepodarilo sa vrátiť späť.')
    expect(toast.variant).toBe('error')
  })

  it('failed() shows an error toast', () => {
    saveFeedback.failed(texts)
    expect(getToasts()[0]).toMatchObject({ message: 'Nepodarilo sa uložiť.', variant: 'error' })
  })
})
