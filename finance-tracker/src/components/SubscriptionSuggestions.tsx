import { Repeat } from 'lucide-react'
import type { SubscriptionSuggestion } from '../api/subscriptions'
import { useSubscriptionSuggestions } from '../hooks/useSubscriptionSuggestions'
import { useFormatters } from '../hooks/useFormatters'
import { useTranslation } from '../i18n'

interface Props {
  onAdd: (s: SubscriptionSuggestion) => void
  /** Most cards to show at once (the rest come up after these are handled) */
  max?: number
  className?: string
}

// "Looks like a subscription: Netflix 12,99 € a month" — one card per pattern
// the server found among one-off expenses, with Add as fixed / Hide.
export function SubscriptionSuggestions({ onAdd, max = 3, className }: Props) {
  const { suggestions, dismiss } = useSubscriptionSuggestions()
  const { formatAmount } = useFormatters()
  const { t } = useTranslation()
  const s = t.subscriptions
  if (!suggestions.length) return null

  const font = "'Manrope', sans-serif"
  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="subscription-suggestions">
      {suggestions.slice(0, max).map(sub => (
        <div
          key={sub.key}
          role="status"
          style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--aurora-glass)', border: '1px solid rgba(251,191,36,.35)', borderRadius: 18, padding: '14px 16px' }}
        >
          <div style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(251,191,36,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Repeat size={17} color="#FBBF24" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontFamily: font, fontSize: 13.5, color: 'var(--aurora-lo)', lineHeight: 1.45 }}>
              {s.title}: <b style={{ color: 'var(--aurora-hi)' }}>{sub.name}</b>{' '}
              <b style={{ color: 'var(--aurora-hi)', whiteSpace: 'nowrap' }}>{formatAmount(sub.amount)}</b> {s.perMonth}
            </p>
            <p style={{ margin: '3px 0 0', fontFamily: font, fontSize: 12, color: 'var(--aurora-faint)' }}>
              {s.detail.replace('{n}', String(sub.occurrences)).replace('{day}', String(sub.dayOfMonth))}
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => onAdd(sub)}
                style={{ padding: '7px 13px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#FBBF24,#f59e0b)', color: '#fff', cursor: 'pointer', fontFamily: font, fontSize: 12.5, fontWeight: 700 }}
              >
                {s.add}
              </button>
              <button
                type="button"
                onClick={() => dismiss(sub.key)}
                style={{ padding: '7px 13px', borderRadius: 10, border: '1px solid var(--aurora-gline)', background: 'transparent', color: 'var(--aurora-lo)', cursor: 'pointer', fontFamily: font, fontSize: 12.5, fontWeight: 600 }}
              >
                {s.hide}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
