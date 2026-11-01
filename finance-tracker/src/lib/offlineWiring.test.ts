import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isUsableSnapshot, PERSIST_BUSTER, PERSIST_MAX_AGE_MS } from './queryPersist'
import { isServerReachable, noteRequestOutcome, setServerReachable } from './connectivity'
import { sk } from '../i18n/sk'
import { en } from '../i18n/en'
import { cs } from '../i18n/cs'
import { pl } from '../i18n/pl'
import { hu } from '../i18n/hu'

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

describe('persisted query cache', () => {
  const snap = (savedAt: number, buster = PERSIST_BUSTER) => ({ buster, savedAt, state: { queries: [], mutations: [] } })
  it('accepts a fresh snapshot of this build only', () => {
    const now = 1_000_000_000_000
    expect(isUsableSnapshot(snap(now - 1000), now)).toBe(true)
    expect(isUsableSnapshot(snap(now - PERSIST_MAX_AGE_MS - 1), now)).toBe(false)
    expect(isUsableSnapshot(snap(now, 'old'), now)).toBe(false)
    expect(isUsableSnapshot(undefined, now)).toBe(false)
  })
})

describe('connectivity flag', () => {
  it('no answer marks the server unreachable; any answer clears it; cancels are ignored', () => {
    noteRequestOutcome({ code: 'ERR_NETWORK' })
    expect(isServerReachable()).toBe(false)
    noteRequestOutcome({ code: 'ERR_CANCELED' })
    expect(isServerReachable()).toBe(false)
    noteRequestOutcome({ response: { status: 500 } })
    expect(isServerReachable()).toBe(true)
    setServerReachable(true)
  })
})

describe('offline wiring', () => {
  it('every add hook creates through the queue and discards queued rows locally', () => {
    for (const f of ['hooks/useVariableExpenses.ts', 'hooks/useIncomes.ts', 'hooks/useFixedExpenses.ts']) {
      const s = src(f)
      expect(s, f).toContain('createOrQueue(')
      expect(s, f).toMatch(/if \(isQueuedId\(id\)\) \{ removeQueued\(id\); return \}/)
      expect(s, f).toContain('useOfflineQueue()')
    }
  })
  it('pages show the badge and lock editing offline', () => {
    for (const f of ['pages/VariableExpenses.tsx', 'pages/Income.tsx', 'pages/FixedExpenses.tsx']) {
      const s = src(f)
      expect(s, f).toContain('<PendingBadge')
      expect(s, f).toContain('useOffline()')
      expect(s, f).toMatch(/SwipeableRow key=\{\w+\.id\} radius=\{0\} disabled=\{!rowActions/)
      expect(s, f).toContain('t.offline.editOffline')
    }
  })
  it('logout clears the queue, the cached queries and the cached user', () => {
    const s = src('lib/userDataReset.ts')
    expect(s).toContain('clearOfflineQueue()')
    expect(s).toContain('clearPersistedQueries()')
    expect(s).toContain('kvDel(OFFLINE_USER_KEY)')
  })
  it('the app mounts the sync + banner, and flushes on online, start and visibility', () => {
    expect(src('App.tsx')).toContain('<OfflineStatus />')
    const s = src('components/OfflineStatus.tsx')
    expect(s).toContain("addEventListener('online', flush)")
    expect(s).toContain("addEventListener('visibilitychange', onVisible)")
    expect(s).toContain('setQueueUser(userId).then')
    expect(s).toContain('startQueryPersistence(qc, userId)')
  })
  it('an offline start opens the cached account only on a network error', () => {
    const s = src('context/AuthContext.tsx')
    expect(s).toMatch(/isOfflineError\(err\) \? await kvGet<AuthUser>\(OFFLINE_USER_KEY\)/)
    expect(s).toContain("window.addEventListener('online', onOnline)")
  })
  it('strings exist in all five languages, informal in sk/cs', () => {
    for (const t of [sk, en, cs, pl, hu]) {
      expect(Object.keys(t.offline).sort()).toEqual(Object.keys(sk.offline).sort())
    }
    expect(sk.offline.banner).toBe('Si offline – zobrazujem posledné údaje')
    expect(sk.offline.pendingBadge).toBe('Čaká na odoslanie')
    expect(cs.offline.banner.startsWith('Jsi')).toBe(true)
  })
})
