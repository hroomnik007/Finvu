import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', new EventTarget())
import { requestAddForm, subscribeAddForm } from './addFormEvents'

describe('addFormEvents', () => {
  it('delivers the requested form type and unsubscribes', () => {
    const fn = vi.fn()
    const off = subscribeAddForm(fn)
    requestAddForm('income')
    expect(fn).toHaveBeenCalledWith('income')
    off()
    requestAddForm('variable')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
