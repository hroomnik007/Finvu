import type { Category } from '../types'
import { useTranslation } from '../i18n'
import { useFormatters } from '../hooks/useFormatters'
import { budgetLevel, limitIsFixedOnly, BUDGET_LEVEL_COLOR } from '../utils/budgetLevel'

/** One member's part of a shared category's spend this month. */
export interface MemberShare { id: string; name: string; amount: number; color: string; me: boolean }

export interface BudgetFigures { spent: number; limit: number; percentage: number }

/**
 * The budget part of a category card. A shared category shows the family's
 * spend in one bar split per member, with a mark at the limit once it is
 * passed (before, the bar was the user's own share and the family's 665 % sat
 * in a small line under it). Others show the user's own spend. The status is a
 * sum: "+270,68 € nad limitom", "ostáva 64,63 €" or "✓ Zaplatené podľa plánu".
 */
export function CategoryBudget({ cat, status, familyStatus, split, compact, nameMembers }: {
  cat: Category
  /** The user's own spend in the category (and its limit). */
  status?: BudgetFigures
  /** Shared category: the whole family's spend against the common limit. */
  familyStatus?: BudgetFigures
  /** Shared category: who spent how much of it. */
  split?: MemberShare[]
  compact?: boolean
  /** Label every member by name (Domácnosť) instead of "Ty" for the user. */
  nameMembers?: boolean
}) {
  const { t } = useTranslation()
  const { formatPercent, formatAmount } = useFormatters()
  const family = cat.shared && familyStatus && split && split.length > 0 ? familyStatus : undefined
  const st = family ?? status
  if (!st || cat.budgetLimit == null) return null
  const level = budgetLevel(st.spent, st.limit, limitIsFixedOnly(cat))
  const color = BUDGET_LEVEL_COLOR[level]
  const scale = Math.max(st.spent, st.limit) || 1
  const parts = family ? split!.filter(m => m.amount > 0) : [{ id: 'own', name: '', amount: st.spent, color, me: true }]
  const chip = level === 'over'
    ? { text: t.expenses.categories.overBy.replace('{amount}', formatAmount(st.spent - st.limit)), color }
    : level === 'planned'
      ? { text: `✓ ${t.expenses.categories.paidAsPlanned}`, color }
      : { text: t.expenses.categories.leftAmount.replace('{amount}', formatAmount(st.limit - st.spent)), color: level === 'near' ? color : 'var(--aurora-faint)' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 4 : 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: compact ? 13 : 18, fontWeight: 700, color: st.spent > 0 ? 'var(--aurora-expense)' : 'var(--aurora-faint)', fontVariantNumeric: 'tabular-nums' }}>
          {formatAmount(st.spent)}
          <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11.5, fontWeight: 500, color: 'var(--aurora-faint)' }}> {t.expenses.categories.ofLimit.replace('{amount}', formatAmount(st.limit))}</span>
        </span>
      </div>
      <div title={formatPercent(st.percentage)} style={{ position: 'relative', height: compact ? 5 : 7, borderRadius: 4, background: 'var(--aurora-gline)', overflow: 'hidden', display: 'flex' }}>
        {parts.map(m => (
          <div key={m.id} style={{ height: '100%', width: `${(m.amount / scale) * 100}%`, background: family ? m.color : color, transition: 'width 0.3s' }} />
        ))}
        {st.spent > st.limit && <div style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(${(st.limit / scale) * 100}% - 1px)`, width: 2, background: 'var(--aurora-hi)' }} />}
      </div>
      {family && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontFamily: "'Manrope', sans-serif", fontSize: 11.5, color: 'var(--aurora-faint)' }}>
          {parts.map(m => (
            <span key={m.id} style={{ whiteSpace: 'nowrap' }}>
              <b style={{ color: m.color, fontWeight: 700 }}>{m.me && !nameMembers ? t.expenses.categories.you : m.name}</b> {formatAmount(m.amount)}
            </span>
          ))}
        </div>
      )}
      <span style={{ alignSelf: 'flex-start', fontFamily: "'Manrope', sans-serif", fontSize: 11.5, fontWeight: 700, color: chip.color, background: `color-mix(in srgb, ${chip.color} 12%, transparent)`, padding: '1px 8px', borderRadius: 99 }}>{chip.text}</span>
    </div>
  )
}

