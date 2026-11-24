import type { CSSProperties, ReactNode } from 'react'
import { Tag } from 'lucide-react'
import type { Category } from '../types'
import { CATEGORY_ICON_MAP } from '../utils/categoryIcons'
import { budgetLevel, budgetSeverity, limitIsFixedOnly, BUDGET_LEVEL_COLOR } from '../utils/budgetLevel'
import { useTranslation } from '../i18n'

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
  const levelOf = (b: BudgetOverviewItem) => budgetLevel(b.spent, b.limit, limitIsFixedOnly(categories.find(c => c.id === b.categoryId)))
  const severity = budgetSeverity(items.map(levelOf))
  const tint = severity === 'red' ? 'var(--aurora-rose)' : severity === 'warning' ? 'var(--aurora-amber)' : null
  return (
    <div style={{
      background: tint ? `color-mix(in srgb, ${tint} 10%, var(--aurora-glass))` : 'var(--aurora-glass)',
      border: tint ? `1px solid color-mix(in srgb, ${tint} 35%, var(--aurora-gline))` : '1px solid var(--aurora-gline)',
      borderRadius: 20,
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      padding: 16,
      ...style,
    }}>
      <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--aurora-hi)', margin: '0 0 12px' }}>{title}</p>
      {items.map(b => {
        const cat = categories.find(c => c.id === b.categoryId)
        const level = levelOf(b)
        const barColor = BUDGET_LEVEL_COLOR[level]
        const Icon = CATEGORY_ICON_MAP[b.categoryIcon ?? ''] ?? Tag
        const row = (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-hi)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon size={14} color={cat?.color ?? FALLBACK_COLOR} strokeWidth={1.8} style={{ flexShrink: 0 }} /> {b.categoryName}
              </span>
              <span title={level === 'planned' ? t.expenses.categories.paidAsPlanned : undefined} style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, color: barColor }}>{level === 'planned' ? '✓ ' : ''}{Math.round(b.percentage)}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 99, background: 'var(--aurora-gline)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 99, width: `${Math.min(b.percentage, 100)}%`, background: barColor }} />
            </div>
          </>
        )
        return onRowClick ? (
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
      })}
      {items.length === 0 && empty}
      {items.length > 0 && footer}
    </div>
  )
}
