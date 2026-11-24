import type { CSSProperties, ReactNode } from 'react'
import { Tag } from 'lucide-react'
import type { Category } from '../types'
import { CATEGORY_ICON_MAP } from '../utils/categoryIcons'
import { budgetLevel, budgetSeverity, compareBudget, limitIsFixedOnly, BUDGET_LEVEL_COLOR } from '../utils/budgetLevel'
import type { BudgetLevel } from '../utils/budgetLevel'
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
 * Category budget card shared by the Dashboard ("Rozpočet") and the Variabilné
 * side panel, so both look the same: severity-tinted glass, icon + name + %,
 * a bar per category. Colours follow utils/budgetLevel: the card turns red /
 * amber when a category is over / near its limit; a category whose fixed-only
 * limit is spent exactly reads as paid as planned (grey ✓), not as an overrun.
 */
export function BudgetOverviewCard({ title, items, categories, onRowClick, empty, footer, style, grouped = false }: {
  title: string
  items: BudgetOverviewItem[]
  categories: Category[]
  onRowClick?: (categoryId: string) => void
  empty?: ReactNode
  footer?: ReactNode
  style?: CSSProperties
  /**
   * Dashboard: only what needs attention — over the limit (by how much), near
   * it, then "as planned" rows without a bar, and one line for everything fine.
   */
  grouped?: boolean
}) {
  const { t } = useTranslation()
  const { formatPercent, formatAmount } = useFormatters()
  const levelOf = (b: BudgetOverviewItem) => budgetLevel(b.spent, b.limit, limitIsFixedOnly(categories.find(c => c.id === b.categoryId)))
  const severity = budgetSeverity(items.map(levelOf))
  const tint = severity === 'red' ? 'var(--aurora-rose)' : severity === 'warning' ? 'var(--aurora-amber)' : null
  // One budget row. Over the limit says by how much (a percentage past 200 %
  // stops meaning anything) and draws the part above the limit brighter.
  const renderRow = (b: BudgetOverviewItem, level: BudgetLevel) => {
    const cat = categories.find(c => c.id === b.categoryId)
    const barColor = BUDGET_LEVEL_COLOR[level]
    const Icon = CATEGORY_ICON_MAP[b.categoryIcon ?? ''] ?? Tag
    const showOverBy = grouped && level === 'over'
    const limitAt = b.spent > 0 ? Math.min((b.limit / b.spent) * 100, 100) : 100
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: level === 'planned' && grouped ? 0 : 4 }}>
          <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-hi)', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <Icon size={14} color={cat?.color ?? FALLBACK_COLOR} strokeWidth={1.8} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.categoryName}</span>
          </span>
          {level === 'planned' && grouped ? (
            <span title={t.expenses.categories.paidAsPlanned} style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 600, color: barColor, whiteSpace: 'nowrap' }}>✓ {formatAmount(b.spent)}</span>
          ) : showOverBy ? (
            <span title={formatPercent(b.percentage)} style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, color: barColor, whiteSpace: 'nowrap' }}>+{formatAmount(b.spent - b.limit)}</span>
          ) : (
            <span title={level === 'planned' ? t.expenses.categories.paidAsPlanned : undefined} style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, color: barColor, whiteSpace: 'nowrap' }}>{level === 'planned' ? '✓ ' : ''}{formatPercent(b.percentage)}</span>
          )}
        </div>
        {!(level === 'planned' && grouped) && (
          <div style={{ height: 6, borderRadius: 99, background: 'var(--aurora-gline)', overflow: 'hidden', display: 'flex' }}>
            {showOverBy ? (
              <>
                <div style={{ height: '100%', width: `${limitAt}%`, background: barColor, opacity: 0.5 }} />
                <div style={{ height: '100%', width: `${100 - limitAt}%`, background: barColor, borderLeft: '2px solid var(--aurora-hi)' }} />
              </>
            ) : (
              <div style={{ height: '100%', borderRadius: 99, width: `${Math.min(b.percentage, 100)}%`, background: barColor }} />
            )}
          </div>
        )}
      </>
    )
  }
  const wrap = (b: BudgetOverviewItem, row: ReactNode) => onRowClick ? (
    <button
      key={b.categoryId}
      type="button"
      className="budget-row"
      onClick={() => onRowClick(b.categoryId)}
      style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit', background: 'transparent', border: 'none', padding: '0 0 10px', margin: 0 }}
    >{row}</button>
  ) : (
    <div key={b.categoryId} style={{ marginBottom: 10 }}>{row}</div>
  )
  return (
    <div style={{
      background: tint ? `color-mix(in srgb, ${tint} 10%, var(--aurora-glass))` : 'var(--aurora-glass)',
      border: tint ? `1px solid color-mix(in srgb, ${tint} 35%, var(--aurora-gline))` : '1px solid var(--aurora-gline)',
      borderRadius: 20,
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      padding: 16,
      position: 'relative',
      ...style,
    }}>
      <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--aurora-hi)', margin: '0 0 12px' }}>{title}</p>
      {grouped ? (() => {
        const attention = items.filter(b => ['over', 'near'].includes(levelOf(b))).sort(compareBudget(levelOf)).slice(0, 6)
        const planned = items.filter(b => levelOf(b) === 'planned')
        const okCount = items.filter(b => levelOf(b) === 'ok').length
        const overCount = items.filter(b => levelOf(b) === 'over').length
        return (
          <>
            {overCount > 0 && (
              <span style={{ position: 'absolute', top: 16, right: 16, fontFamily: "'Manrope', sans-serif", fontSize: 11, fontWeight: 700, color: 'var(--aurora-rose)', background: 'color-mix(in srgb, var(--aurora-rose) 14%, transparent)', padding: '2px 8px', borderRadius: 99 }}>
                {t.dashboard.budgetOverCount.replace('{n}', String(overCount))}
              </span>
            )}
            {attention.map(b => wrap(b, renderRow(b, levelOf(b))))}
            {planned.length > 0 && (
              <>
                <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, color: 'var(--aurora-faint)', margin: attention.length > 0 ? '4px 0 6px' : '0 0 6px' }}>{t.dashboard.budgetPlanned}</p>
                {planned.map(b => wrap(b, renderRow(b, 'planned')))}
              </>
            )}
            {okCount > 0 && items.length > 0 && (
              <p style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', margin: '2px 0 8px' }}>
                <span>{attention.length + planned.length > 0 ? t.dashboard.budgetOthersOk : t.dashboard.budgetAllOk}</span>
                <span aria-hidden style={{ color: 'var(--aurora-emerald)', fontWeight: 700 }}>✓</span>
              </p>
            )}
          </>
        )
      })() : items.map(b => wrap(b, renderRow(b, levelOf(b))))}
      {items.length === 0 && empty}
      {items.length > 0 && footer}
    </div>
  )
}
