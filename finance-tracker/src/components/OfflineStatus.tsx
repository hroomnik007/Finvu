import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CloudOff, RotateCw, Trash2 } from 'lucide-react'
import { useTranslation } from '../i18n'
import { useAuth } from '../context/AuthContext'
import { useOffline, useOfflineQueue } from '../hooks/useOfflineQueue'
import { useFormatters } from '../hooks/useFormatters'
import { createTransaction } from '../api/transactions'
import { flushQueue, onQueueFlushed, removeQueued, retryQueued, setQueueUser } from '../lib/offlineQueue'
import { startQueryPersistence } from '../lib/queryPersist'
import { showToast } from '../lib/toastStore'
import { pluralCount } from '../utils/plural'
import { queuedItemLabel } from '../utils/queuedRows'

const send = createTransaction

/**
 * Offline support for the signed-in app: loads the user's queue and cached
 * data, sends waiting creates when the connection is back, and shows the
 * offline banner plus any item the server refused.
 */
export function OfflineStatus() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const { t, locale } = useTranslation()
  const { formatAmount } = useFormatters()
  const offline = useOffline()
  const queue = useOfflineQueue()
  const userId = user?.id ?? null

  useEffect(() => {
    if (!userId) { void setQueueUser(null); return }
    const stopPersist = startQueryPersistence(qc, userId)
    let alive = true
    void setQueueUser(userId).then(() => { if (alive) void flushQueue(send) })
    const flush = () => { void flushQueue(send) }
    const onVisible = () => { if (document.visibilityState === 'visible') flush() }
    window.addEventListener('online', flush)
    document.addEventListener('visibilitychange', onVisible)
    const offFlushed = onQueueFlushed(r => {
      for (const key of ['variableExpenses', 'incomes', 'fixedExpenses', 'summaryCards', 'dashboardChart', 'monthlySeries', 'transactions', 'subscriptionSuggestions']) {
        void qc.invalidateQueries({ queryKey: [key] })
      }
      showToast(t.offline.synced.replace('{n}', String(r.sent)), { variant: 'success' })
    })
    return () => {
      alive = false
      stopPersist()
      window.removeEventListener('online', flush)
      document.removeEventListener('visibilitychange', onVisible)
      offFlushed()
    }
  }, [userId, qc, t])

  const waiting = queue.filter(q => q.status === 'pending').length
  const failed = queue.filter(q => q.status === 'failed')
  if (!offline && waiting === 0 && failed.length === 0) return null

  return (
    <div style={{ padding: '8px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {(offline || waiting > 0) && (
        <div role="status" aria-live="polite" className="offline-banner" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 12, background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-hi)' }}>
          <CloudOff size={15} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--aurora-lo)' }} />
          <span>
            {offline && t.offline.banner}
            {offline && waiting > 0 && ' · '}
            {waiting > 0 && pluralCount(waiting, t.offline.waiting, locale)}
          </span>
        </div>
      )}
      {failed.length > 0 && (
        <section aria-labelledby="offline-failed-title" style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--aurora-glass)', border: '1px solid var(--aurora-rose)', fontFamily: "'Manrope', sans-serif" }}>
          <h2 id="offline-failed-title" style={{ fontSize: 13, fontWeight: 700, margin: '0 0 6px', color: 'var(--aurora-hi)' }}>{t.offline.failedTitle}</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {failed.map(item => {
              const label = `${queuedItemLabel(item)} · ${formatAmount(item.payload.amount)}`
              return (
                <li key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--aurora-hi)' }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {label}
                    {item.error?.status ? <span style={{ color: 'var(--aurora-faint)' }}> ({item.error.code ?? item.error.status})</span> : null}
                  </span>
                  <button type="button" className="btn-icon" onClick={() => { void retryQueued(item.key, send) }} aria-label={`${t.offline.retry}: ${label}`} title={t.offline.retry} disabled={offline} style={{ color: 'var(--aurora-lo)' }}>
                    <RotateCw size={15} />
                  </button>
                  <button type="button" className="btn-icon" onClick={() => removeQueued(item.key)} aria-label={`${t.offline.discard}: ${label}`} title={t.offline.discard} style={{ color: 'var(--aurora-faint)' }}>
                    <Trash2 size={15} />
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}

/** Small badge on a row that only exists in the offline queue. */
export function PendingBadge({ state }: { state: 'pending' | 'failed' | undefined }) {
  const { t } = useTranslation()
  if (!state) return null
  const failed = state === 'failed'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 3, padding: '1px 7px', borderRadius: 999, fontSize: 11, fontWeight: 600, fontFamily: "'Manrope', sans-serif", background: failed ? 'rgba(244,63,94,0.15)' : 'var(--aurora-glass)', color: failed ? 'var(--aurora-rose)' : 'var(--aurora-lo)', border: '1px solid var(--aurora-gline)', whiteSpace: 'nowrap' }}>
      <CloudOff size={11} aria-hidden="true" />
      {failed ? t.offline.failedBadge : t.offline.pendingBadge}
    </span>
  )
}
