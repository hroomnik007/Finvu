import type { CSSProperties, ReactNode } from 'react'
import { Tag } from 'lucide-react'
import type { Category } from '../types'
import { CATEGORY_ICON_MAP } from '../utils/categoryIcons'
import { budgetLevel, limitIsFixedOnly, BUDGET_LEVEL_COLOR } from '../utils/budgetLevel'
import { useTranslation } from '../i18n'
import { useFormatters } from '../hooks/useFormatters'

const FALLBACK_COLOR = '#6b7280'

export interface BudgetOverviewItem {
  categoryId: string
  categoryName: string
  categoryIcon?: string | null
  percentage: number
  spent: number
  limit: number
}

/**
 * Budget per category for side panels (Variabilné). Same look as the Fixné
 * "Podľa kategórie" panel: an icon tile in the category's colour, the name,
 * what was spent and the share of the limit, a thin bar in the budget level's
 * colour (utils/budgetLevel), hairlines between rows and the total at the end.
 */
export function BudgetOverviewCard({ title, items, categories, onRowClick, empty, footer, style }: {
  title: string
  items: BudgetOverviewItem[]
  categories: Category[]
  onRowClick?: (categoryId: string) => void
  empty?: ReactNode
  footer?: ReactNode
  style?: CSSProperties
}) {
  const { t } = useTranslation()
  const { formatPercent, formatAmount } = useFormatters()
  const totalSpent = items.reduce((s, b) => s + b.spent, 0)
  const totalLimit = items.reduce((s, b) => s + b.limit, 0)

  const row = (b: BudgetOverviewItem, i: number) => {
    const cat = categories.find(c => c.id === b.categoryId)
    const level = budgetLevel(b.spent, b.limit, limitIsFixedOnly(cat))
    const barColor = BUDGET_LEVEL_COLOR[level]
    const color = cat?.color ?? FALLBACK_COLOR
    const Icon = CATEGORY_ICON_MAP[b.categoryIcon ?? cat?.icon ?? ''] ?? Tag
    const content = (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i > 0 ? '1px solid var(--aurora-gline)' : 'none' }}>
        <span style={{ width: 28, height: 28, borderRadius: 9, background: `color-mix(in srgb, ${color} 16%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={14} color={color} strokeWidth={1.8} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.categoryName}</span>
            <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 700, color: 'var(--aurora-hi)' }}>{formatAmount(b.spent)}</span>
              <span title={level === 'planned' ? t.expenses.categories.paidAsPlanned : undefined} style={{ fontFamily: "'Outfit', sans-serif", fontSize: 11.5, fontWeight: 700, color: barColor, marginLeft: 6 }}>{level === 'planned' ? '✓ ' : ''}{formatPercent(b.percentage)}</span>
            </span>
          </div>
          <div style={{ height: 3, borderRadius: 99, background: 'var(--aurora-gline)', marginTop: 5, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(b.percentage, 100)}%`, background: barColor, borderRadius: 99 }} />
          </div>
        </div>
      </div>
    )
    return onRowClick ? (
      <button
        key={b.categoryId}
        type="button"
        className="budget-row"
        onClick={() => onRowClick(b.categoryId)}
        style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit', background: 'transparent', border: 'none', padding: 0, margin: 0 }}
      >{content}</button>
    ) : <div key={b.categoryId}>{content}</div>
  }

  return (
    <div style={{
      background: 'var(--aurora-glass)',
      border: '1px solid var(--aurora-gline)',
      borderRadius: 16,
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      padding: 16,
      ...style,
    }}>
      <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--aurora-hi)', margin: '0 0 8px' }}>{title}</p>
      {items.map(row)}
      {items.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, marginTop: 2, borderTop: '1px solid var(--aurora-gline)', fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)' }}>
          <span>{t.annual.total}</span>
          <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, color: 'var(--aurora-hi)', fontVariantNumeric: 'tabular-nums' }}>
            {formatAmount(totalSpent)} <span style={{ fontWeight: 500, color: 'var(--aurora-faint)' }}>{t.expenses.categories.ofLimit.replace('{amount}', formatAmount(totalLimit))}</span>
          </span>
        </div>
      )}
      {items.length === 0 && empty}
      {items.length > 0 && footer}
    </div>
  )
}
