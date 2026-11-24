import type { ReactNode } from 'react'
import { Tag } from 'lucide-react'
import type { Category } from '../types'
import { GlassCard } from './GlassCard'
import { useFormatters } from '../hooks/useFormatters'
import { useTranslation } from '../i18n'
import { CATEGORY_ICON_MAP } from '../utils/categoryIcons'
import { budgetLevel, limitIsFixedOnly, BUDGET_LEVEL_COLOR } from '../utils/budgetLevel'

export interface BudgetAttentionItem {
  categoryId: string
  categoryName: string
  spent: number
  limit: number
}

const FALLBACK_COLOR = '#6b7280'

/**
 * Dashboard "Rozpočet": every category with a limit, one row each in the same
 * shape — icon, name, "52 % · 59,20 / 113,20" and a bar — fullest first, so a
 * category over its limit is simply the one at the top in red (with the limit
 * marked on its bar). A category paid exactly by its fixed payments reads
 * "100 %" in the neutral colour instead of a separate "Podľa plánu" group.
 */
export function BudgetAttentionCard({ title, items, categories, empty }: {
  title: string
  items: BudgetAttentionItem[]
  categories: Category[]
  /** Shown when no category has a limit. */
  empty?: ReactNode
}) {
  const { t, locale } = useTranslation()
  const { formatPercent } = useFormatters()
  const key = (n: string) => n.trim().toLowerCase()
  const catOf = (b: BudgetAttentionItem) => categories.find(c => c.id === b.categoryId) ?? categories.find(c => key(c.name) === key(b.categoryName))
  const levelOf = (b: BudgetAttentionItem) => budgetLevel(b.spent, b.limit, limitIsFixedOnly(catOf(b)))
  const overCount = items.filter(b => levelOf(b) === 'over').length
  const rows = [...items].sort((a, b) => b.spent / b.limit - a.spent / a.limit || b.spent - a.spent)
  // "570,68 / 300": plain numbers, decimals only where there are some
  const num = (v: number) => new Intl.NumberFormat(locale, { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }).format(v)

  return (
    <GlassCard radius={20}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--aurora-hi)', margin: 0 }}>{title}</h3>
        {overCount > 0 && (
          <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, fontWeight: 700, color: 'var(--aurora-rose)', background: 'color-mix(in srgb, var(--aurora-rose) 14%, transparent)', padding: '2px 9px', borderRadius: 99, whiteSpace: 'nowrap' }}>
            {t.dashboard.budgetOverCount.replace('{n}', String(overCount))}
          </span>
        )}
      </div>

      {items.length === 0 ? empty : rows.map(b => {
        const cat = catOf(b)
        const Icon = CATEGORY_ICON_MAP[cat?.icon ?? ''] ?? Tag
        const catColor = cat?.color ?? FALLBACK_COLOR
        const level = levelOf(b)
        const color = BUDGET_LEVEL_COLOR[level]
        const pct = (b.spent / b.limit) * 100
        // Past the limit the bar is the spend; the white mark shows where the limit was
        const limitAt = level === 'over' ? Math.min((b.limit / b.spent) * 100, 100) : null
        return (
          <div key={b.categoryId} title={level === 'planned' ? t.expenses.categories.paidAsPlanned : undefined} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, background: catColor + '26', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={15} color={catColor} strokeWidth={1.8} aria-hidden />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
                <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{b.categoryName}</span>
                <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11.5, color: 'var(--aurora-faint)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                  <b style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, color }}>{formatPercent(pct)}</b>
                  {' · '}{num(b.spent)} / {num(b.limit)}
                </span>
              </div>
              <div style={{ position: 'relative', height: 6, borderRadius: 9, background: 'var(--aurora-gline)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 9 }} />
                {limitAt !== null && limitAt < 100 && (
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(${limitAt}% - 1px)`, width: 2, background: 'var(--aurora-hi)' }} />
                )}
              </div>
            </div>
          </div>
        )
      })}
    </GlassCard>
  )
}
