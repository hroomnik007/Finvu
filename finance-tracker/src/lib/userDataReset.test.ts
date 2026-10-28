import { beforeEach, describe, expect, it, vi } from 'vitest'

class MemStorage {
  private m = new Map<string, string>()
  get length() { return this.m.size }
  key(i: number) { return [...this.m.keys()][i] ?? null }
  getItem(k: string) { return this.m.get(k) ?? null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
}
const events: string[] = []
vi.stubGlobal('localStorage', new MemStorage())
vi.stubGlobal('window', { dispatchEvent: (e: Event) => { events.push(e.type); return true } })

import { queryClient } from './queryClient'
import { clearUserData, noteSignedInUser, USER_DATA_CLEARED_EVENT } from './userDataReset'

const seed = () => queryClient.setQueryData(['incomes', 2026, 10], [{ amount: 2000 }])
const cached = () => queryClient.getQueryData(['incomes', 2026, 10])

beforeEach(() => {
  queryClient.clear()
  localStorage.clear()
  events.length = 0
  clearUserData()
})

describe('clearUserData (logout)', () => {
  it('drops cached queries', () => {
    seed()
    clearUserData()
    expect(cached()).toBeUndefined()
  })

  it('removes per-user storage, keeps device prefs', () => {
    for (const k of ['category_budget_limits', 'fixed_expense_notified', 'finvu_read_notifications',
      'finvu_session_id', 'profile_name', 'profile_avatar', 'auth_remember',
      'pin_enabled_a@b.sk', 'webauthn_enabled_a@b.sk']) localStorage.setItem(k, 'x')
    localStorage.setItem('theme_preference', 'dark')
    localStorage.setItem('lock_method', 'pin')
    clearUserData()
    expect(localStorage.length).toBe(2)
    expect(localStorage.getItem('theme_preference')).toBe('dark')
    expect(localStorage.getItem('lock_method')).toBe('pin')
  })

  it('tells listeners to reset in-memory profile', () => {
    clearUserData()
    expect(events).toContain(USER_DATA_CLEARED_EVENT)
  })
})

describe('noteSignedInUser (login / account switch)', () => {
  it('keeps the cache when the same user is confirmed again', () => {
    noteSignedInUser('u1')
    seed()
    noteSignedInUser('u1')
    expect(cached()).toBeDefined()
  })

  it('drops the cache when a different user signs in', () => {
    noteSignedInUser('u1')
    seed()
    noteSignedInUser('u2')
    expect(cached()).toBeUndefined()
  })

  it('drops the cache on first sign-in after logout or guest mode', () => {
    seed()
    noteSignedInUser('u1')
    expect(cached()).toBeUndefined()
  })
})
