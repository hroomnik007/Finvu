import { useFormatters } from '../hooks/useFormatters'
import { useTranslation } from '../i18n'
import { budgetLevel, BUDGET_LEVEL_COLOR } from '../utils/budgetLevel'

/**
 * The chosen category's budget inside an add/edit form: spent (with the typed
 * amount) against the limit, and what that leaves — so the effect of a new
 * expense is visible before saving.
 */
export function BudgetPreview({ name, spent, limit, showAfter }: {
  name: string
  /** Already including the amount being typed. */
  spent: number
  limit: number
  /** Add forms with an amount typed: say what the entry leaves. */
  showAfter: boolean
}) {
  const { formatAmount } = useFormatters()
  const { t } = useTranslation()
  const color = BUDGET_LEVEL_COLOR[budgetLevel(spent, limit)]
  const left = limit - spent
  return (
    <div style={{ borderRadius: 12, padding: '10px 12px', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, marginBottom: 6, color: 'var(--aurora-lo)', fontFamily: "'Manrope', sans-serif" }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatAmount(spent)} / {formatAmount(limit)}</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--aurora-gline)', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 2, width: `${Math.min((spent / limit) * 100, 100)}%`, background: color }} />
      </div>
      {showAfter && (
        <div style={{ marginTop: 6, fontFamily: "'Manrope', sans-serif", fontSize: 12, color: left < 0 ? 'var(--aurora-rose)' : 'var(--aurora-faint)' }}>
          {left >= 0
            ? t.fab.leftAfter.replace('{amount}', formatAmount(left))
            : t.fab.overAfter.replace('{amount}', formatAmount(-left))}
        </div>
      )}
    </div>
  )
}
