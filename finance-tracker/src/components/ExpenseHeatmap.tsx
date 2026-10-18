import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Tag } from 'lucide-react'
import type { VariableExpense, Category } from '../types'
import { useFormatters } from '../hooks/useFormatters'
import { useTranslation } from '../i18n'
import { GlassCard } from './GlassCard'
import { CATEGORY_ICON_MAP } from '../utils/categoryIcons'
import { todayISO } from '../utils/format'

interface ExpenseHeatmapProps {
  expenses: VariableExpense[]
  month: number
  year: number
  categories?: Category[]
  onNavigate?: (page: 'variable-expenses') => void
}

// Same small/stredné/veľké severity thresholds and colors as the Fixné
// výdavky "Kalendár mesiaca" widget (FixedExpenses.tsx), applied to the
// day's total variable-expense amount instead of fixed-expense amount.
function severityColor(amount: number): string {
  if (amount >= 100) return 'rgba(251,113,133,0.6)'
  if (amount >= 20) return 'rgba(251,191,36,0.55)'
  return 'rgba(139,92,246,0.5)'
}

type TooltipState = {
  date: string
  amount: number
  x: number
  y: number
  dayExpenses: VariableExpense[]
} | null

export function ExpenseHeatmap({ expenses, month, year, categories = [], onNavigate }: ExpenseHeatmapProps) {
  const { formatAmount } = useFormatters()
  const { t } = useTranslation()
  const [tooltip, setTooltip] = useState<TooltipState>(null)
  const [lastClickedDay, setLastClickedDay] = useState<string | null>(null)

  // The day-detail popup is anchored to a fixed viewport position captured at
  // open time, so once the page scrolls it would float detached over unrelated
  // content ("prilepený"). Dismiss it on any scroll / resize / outside tap.
  useEffect(() => {
    if (!tooltip) return
    const close = () => setTooltip(null)
    window.addEventListener('scroll', close, { passive: true, capture: true })
    window.addEventListener('resize', close)
    window.addEventListener('pointerdown', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('pointerdown', close)
    }
  }, [tooltip])

  const daysInMonth = new Date(year, month, 0).getDate()

  const dailyTotals: Record<string, number> = {}
  const dailyExpenses: Record<string, VariableExpense[]> = {}
  for (const exp of expenses) {
    dailyTotals[exp.date] = (dailyTotals[exp.date] || 0) + exp.amount
    if (!dailyExpenses[exp.date]) dailyExpenses[exp.date] = []
    dailyExpenses[exp.date].push(exp)
  }

  const todayStr = todayISO()
  const isCurrentMonth = todayStr.startsWith(`${year}-${String(month).padStart(2, '0')}`)
  const todayDay = isCurrentMonth ? new Date().getDate() : 0

  const monthLabel = `${t.months[month - 1]} ${year}`
  const legendBorder = '1px solid var(--aurora-gline)'

  return (
    <GlassCard radius={20} style={{ height: '100%', boxSizing: 'border-box' }}>
      <h3 className="text-center lg:text-left" style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, color: 'var(--aurora-hi)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
        {t.dashboard.heatmapTitle}
      </h3>
      <p className="text-center lg:text-left" style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, color: 'var(--aurora-faint)', marginBottom: 12, textTransform: 'capitalize' }}>
        {monthLabel}
      </p>

      {/* Day-strip — wrapping row of day pills, color-coded by daily spend severity */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const amount = dailyTotals[dateStr] || 0
          const hasSpend = amount > 0
          const isToday = todayDay === day
          const isPast = todayDay > 0 && day < todayDay
          const isSelected = lastClickedDay === dateStr

          return (
            <div
              key={day}
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: hasSpend ? severityColor(amount) : 'var(--aurora-glass)',
                cursor: hasSpend ? 'pointer' : 'default',
                border: isSelected ? '1.5px solid #F59E0B' : isToday ? '1.5px solid var(--aurora-violet)' : '1px solid var(--aurora-gline)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                fontWeight: 600,
                fontFamily: "'Outfit', sans-serif",
                color: hasSpend ? 'white' : isToday ? 'var(--aurora-violet)' : 'var(--aurora-faint)',
                opacity: isPast ? 0.55 : 1,
                position: 'relative',
                transition: 'transform 0.12s',
              }}
              onMouseEnter={e => {
                if (hasSpend) {
                  (e.currentTarget as HTMLElement).style.transform = 'scale(1.12)'
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  setTooltip({
                    date: dateStr,
                    amount,
                    x: rect.left + rect.width / 2,
                    y: rect.top - 8,
                    dayExpenses: dailyExpenses[dateStr] ?? [],
                  })
                }
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.transform = 'scale(1)'
                setTooltip(null)
              }}
              onClick={() => {
                if (amount === 0) return
                if (lastClickedDay === dateStr) {
                  if (onNavigate) onNavigate('variable-expenses')
                  setLastClickedDay(null)
                } else {
                  setLastClickedDay(dateStr)
                }
              }}
              onTouchStart={e => {
                if (amount > 0) {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  setTooltip({
                    date: dateStr,
                    amount,
                    x: rect.left + rect.width / 2,
                    y: rect.top - 8,
                    dayExpenses: dailyExpenses[dateStr] ?? [],
                  })
                  setTimeout(() => setTooltip(null), 2500)
                }
              }}
            >
              {day}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: "'Manrope', sans-serif", fontSize: 11, color: 'var(--aurora-faint)', marginTop: 12, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: 'rgba(139,92,246,0.5)', display: 'inline-block' }} />malé</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: 'rgba(251,191,36,0.55)', display: 'inline-block' }} />stredné</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: 'rgba(251,113,133,0.6)', display: 'inline-block' }} />veľké (≥100€)</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}><span style={{ width: 9, height: 9, borderRadius: 3, background: 'transparent', border: '1.5px solid var(--aurora-violet)', display: 'inline-block' }} />dnes</span>
      </div>

      {/* Tooltip — portaled to <body> because GlassCard's backdrop-filter
          establishes a containing block for position:fixed descendants,
          which would otherwise place this at the wrong on-screen spot
          instead of anchored to the hovered cell. */}
      {tooltip && createPortal(
        <div
          style={{
            position: 'fixed',
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translateX(-50%) translateY(-100%)',
            background: 'var(--aurora-panel)',
            border: legendBorder,
            borderRadius: 10,
            padding: '8px 12px',
            fontSize: 12,
            fontFamily: "'Manrope', sans-serif",
            color: 'var(--aurora-hi)',
            pointerEvents: 'none',
            zIndex: 9999,
            minWidth: 160,
            maxWidth: 220,
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{tooltip.date}</div>
          <div style={{ color: 'var(--aurora-rose)', fontWeight: 600, marginBottom: 6, fontFamily: "'Outfit', sans-serif" }}>
            -{formatAmount(tooltip.amount)}
          </div>
          {tooltip.dayExpenses.slice(0, 3).map((exp, i) => {
            const cat = categories.find(c => c.id === exp.categoryId)
            const Icon = CATEGORY_ICON_MAP[cat?.icon ?? ''] ?? Tag
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <Icon size={13} color={cat?.color ?? 'var(--aurora-faint)'} strokeWidth={1.8} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--aurora-lo)', fontSize: 11 }}>
                  {exp.note || '—'}
                </span>
                <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 11, color: 'var(--aurora-rose)', flexShrink: 0 }}>
                  -{formatAmount(exp.amount)}
                </span>
              </div>
            )
          })}
          {tooltip.dayExpenses.length > 3 && (
            <div style={{ color: 'var(--aurora-faint)', fontSize: 10, marginTop: 4 }}>
              + {tooltip.dayExpenses.length - 3} ďalších
            </div>
          )}
        </div>,
        document.body
      )}
    </GlassCard>
  )
}
