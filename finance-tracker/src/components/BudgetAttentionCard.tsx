import type { ReactNode } from 'react'
import type { Category } from '../types'
import { GlassCard } from './GlassCard'
import { useFormatters } from '../hooks/useFormatters'
import { useTranslation } from '../i18n'
import { budgetLevel, limitIsFixedOnly } from '../utils/budgetLevel'

export interface BudgetAttentionItem {
  categoryId: string
  categoryName: string
  spent: number
  limit: number
}

/**
 * Dashboard "Rozpočet", as approved in the UI review mockup: only what needs a
 * look. Categories over their limit say by how much ("+270,68 € · 570,68 / 300")
 * with the limit marked on the bar; categories whose limit is just their fixed
 * payments and were paid exactly are listed under "Podľa plánu"; everything
 * else is one line.
 */
export function BudgetAttentionCard({ title, items, categories, empty }: {
  title: string
  items: BudgetAttentionItem[]
  categories: Category[]
  /** Shown when no category has a limit. */
  empty?: ReactNode
}) {
  const { t, locale } = useTranslation()
  const { formatAmount } = useFormatters()
  const levelOf = (b: BudgetAttentionItem) => budgetLevel(b.spent, b.limit, limitIsFixedOnly(categories.find(c => c.id === b.categoryId)))
  const over = items.filter(b => levelOf(b) === 'over').sort((a, b) => (b.spent - b.limit) - (a.spent - a.limit))
  const planned = items.filter(b => levelOf(b) === 'planned')
  const rest = items.length - over.length - planned.length
  // "570,68 / 300": plain numbers, decimals only where there are some
  const num = (v: number) => new Intl.NumberFormat(locale, { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }).format(v)

  return (
    <GlassCard radius={20}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--aurora-hi)', margin: 0 }}>{title}</h3>
        {over.length > 0 && (
          <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, fontWeight: 700, color: 'var(--aurora-rose)', background: 'color-mix(in srgb, var(--aurora-rose) 14%, transparent)', padding: '2px 9px', borderRadius: 99, whiteSpace: 'nowrap' }}>
            {t.dashboard.budgetOverCount.replace('{n}', String(over.length))}
          </span>
        )}
      </div>

      {items.length === 0 ? empty : (
        <>
          {over.map(b => {
            const limitAt = Math.min((b.limit / b.spent) * 100, 100)
            return (
              <div key={b.categoryId} style={{ padding: '7px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{b.categoryName}</span>
                  <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11.5, color: 'var(--aurora-faint)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    <b style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, color: 'var(--aurora-rose)' }}>+{formatAmount(b.spent - b.limit)}</b>
                    {' · '}{num(b.spent)} / {num(b.limit)}
                  </span>
                </div>
                <div style={{ position: 'relative', height: 6, borderRadius: 9, background: 'var(--aurora-gline)', overflow: 'hidden', display: 'flex' }}>
                  <div style={{ height: '100%', width: `${limitAt}%`, background: 'var(--aurora-rose)', opacity: 0.55 }} />
                  <div style={{ height: '100%', width: `${100 - limitAt}%`, background: 'var(--aurora-rose)' }} />
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(${limitAt}% - 1px)`, width: 2, background: 'var(--aurora-hi)' }} />
                </div>
              </div>
            )
          })}

          {planned.length > 0 && (
            <>
              <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, color: 'var(--aurora-faint)', margin: over.length > 0 ? '10px 0 2px' : '0 0 2px' }}>{t.dashboard.budgetPlanned}</p>
              {planned.map(b => (
                <div key={b.categoryId} title={t.expenses.categories.paidAsPlanned} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '7px 0' }}>
                  <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{b.categoryName}</span>
                  <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, fontWeight: 700, color: 'var(--aurora-lo)', background: 'color-mix(in srgb, var(--aurora-lo) 16%, transparent)', padding: '2px 9px', borderRadius: 99, whiteSpace: 'nowrap' }}>
                    ✓ {formatAmount(b.spent)} {t.dashboard.fixedSuffix}
                  </span>
                </div>
              ))}
            </>
          )}

          {rest > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 8, paddingTop: 10, borderTop: '1px solid var(--aurora-gline)', fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)' }}>
              <span>{over.length + planned.length > 0 ? t.dashboard.budgetOthersOk : t.dashboard.budgetAllOk}</span>
              <span aria-hidden style={{ color: 'var(--aurora-emerald)', fontWeight: 700 }}>✓</span>
            </div>
          )}
        </>
      )}
    </GlassCard>
  )
}
