import { useState } from 'react'
import { ChevronDown, Repeat } from 'lucide-react'
import type { SubscriptionSuggestion } from '../api/subscriptions'
import { useSubscriptionSuggestions } from '../hooks/useSubscriptionSuggestions'
import { useFormatters } from '../hooks/useFormatters'
import { useTranslation } from '../i18n'
import { pluralText } from '../utils/plural'
import { GlassCard } from './GlassCard'

interface Props {
  onAdd: (s: SubscriptionSuggestion) => void
  /** Most suggestions to list at once (the rest come up after these are handled) */
  max?: number
  className?: string
}

const amberTint = (pct: number) => `color-mix(in srgb, var(--aurora-amber) ${pct}%, transparent)`

// "2 possible recurring payments" — one quiet row that opens into the patterns
// the server found among one-off expenses, each with Add as fixed / Hide.
// Collapsed by default so it never pushes the page's own content down.
export function SubscriptionSuggestions({ onAdd, max = 3, className }: Props) {
  const { suggestions, dismiss } = useSubscriptionSuggestions()
  const { formatAmount } = useFormatters()
  const { t, locale } = useTranslation()
  const [open, setOpen] = useState(false)
  const s = t.subscriptions
  if (!suggestions.length) return null

  const shown = suggestions.slice(0, max)
  const font = "'Manrope', sans-serif"
  return (
    <GlassCard className={className} radius={18} style={{ padding: 0, borderColor: amberTint(35) }}>
      <div data-testid="subscription-suggestions">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
          style={{ width: '100%', minHeight: 48, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
        >
          <span aria-hidden style={{ width: 30, height: 30, borderRadius: 10, background: amberTint(16), color: 'var(--aurora-amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Repeat size={15} />
          </span>
          <span style={{ flex: 1, minWidth: 0, fontFamily: font, fontSize: 13.5, fontWeight: 600, color: 'var(--aurora-hi)' }}>
            {pluralText(shown.length, s.summary, locale)}
          </span>
          <ChevronDown size={16} aria-hidden style={{ color: 'var(--aurora-lo)', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease' }} />
        </button>

        {open && shown.map(sub => (
          <div
            key={sub.key}
            style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 14px', borderTop: '1px solid var(--aurora-gline)' }}
          >
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <p style={{ margin: 0, fontFamily: font, fontSize: 13.5, color: 'var(--aurora-lo)', lineHeight: 1.45 }}>
                <b style={{ color: 'var(--aurora-hi)' }}>{sub.name}</b>{' · '}
                <b style={{ color: 'var(--aurora-hi)', whiteSpace: 'nowrap' }}>{formatAmount(sub.amount)}</b> {s.perMonth}
              </p>
              <p style={{ margin: '2px 0 0', fontFamily: font, fontSize: 12, color: 'var(--aurora-faint)' }}>
                {s.detail.replace('{n}', String(sub.occurrences)).replace('{day}', String(sub.dayOfMonth))}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => onAdd(sub)}
                style={{ minHeight: 34, padding: '0 13px', borderRadius: 10, border: `1px solid ${amberTint(45)}`, background: amberTint(16), color: 'var(--aurora-hi)', cursor: 'pointer', fontFamily: font, fontSize: 12.5, fontWeight: 700 }}
              >
                {s.add}
              </button>
              <button
                type="button"
                onClick={() => dismiss(sub.key)}
                style={{ minHeight: 34, padding: '0 13px', borderRadius: 10, border: '1px solid var(--aurora-gline)', background: 'transparent', color: 'var(--aurora-lo)', cursor: 'pointer', fontFamily: font, fontSize: 12.5, fontWeight: 600 }}
              >
                {s.hide}
              </button>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  )
}
