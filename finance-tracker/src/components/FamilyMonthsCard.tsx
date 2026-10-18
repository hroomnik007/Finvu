import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { GlassCard } from './GlassCard'
import { useFormatters } from '../hooks/useFormatters'
import { useTranslation } from '../i18n'
import { getMonthlySeries } from '../api/transactions'
import { savingsRatePct } from '../utils/annual'

const MEMBER_COLORS = ['#A78BFA', '#F59E0B', '#3B82F6', '#EC4899', '#F97316', '#22D3EE']
const CHART_H = 120

interface Props {
  month: number
  year: number
  /** Clicking a month makes it the month of the whole app. */
  onSelectMonth: (month: number, year: number) => void
}

// Six months ending at (month, year) as YYYY-MM
function lastSixMonths(month: number, year: number): { from: string; to: string } {
  const idx = year * 12 + (month - 1)
  const fmt = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`
  return { from: fmt(idx - 5), to: fmt(idx) }
}

export function FamilyMonthsCard({ month, year, onSelectMonth }: Props) {
  const { t } = useTranslation()
  const { formatAmount } = useFormatters()
  const [byMember, setByMember] = useState(false)
  const { from, to } = lastSixMonths(month, year)
  const { data } = useQuery({
    queryKey: ['monthlySeries', from, to, 'family'],
    queryFn: () => getMonthlySeries(from, to, 'family'),
  })
  const months = data?.months ?? []
  if (months.length === 0) return null

  const max = Math.max(1, ...months.flatMap(m => [m.income, m.expense]))
  const memberIds = [...new Set(months.flatMap(m => (m.members ?? []).map(x => x.userId)))]
  const memberName = new Map(months.flatMap(m => (m.members ?? []).map(x => [x.userId, x.name] as const)))
  const cur = months[months.length - 1]
  const prev = months[months.length - 2]
  const rate = savingsRatePct(cur.income, cur.expense)
  const prevRate = prev ? savingsRatePct(prev.income, prev.expense) : null
  const delta = rate !== null && prevRate !== null ? rate - prevRate : null
  const canSplit = memberIds.length > 1

  const toggleBtn = (active: boolean): React.CSSProperties => ({
    padding: '5px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Manrope', sans-serif",
    background: active ? 'rgba(139,92,246,0.18)' : 'var(--aurora-glass)',
    color: active ? 'var(--aurora-violet)' : 'var(--aurora-lo)',
    border: active ? '1px solid rgba(139,92,246,0.45)' : '1px solid var(--aurora-gline)',
  })

  return (
    <GlassCard radius={20}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--aurora-hi)', margin: 0 }}>
          {t.household.monthsTitle}
        </p>
        {canSplit && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={() => setByMember(false)} style={toggleBtn(!byMember)}>{t.household.monthsTotal}</button>
            <button type="button" onClick={() => setByMember(true)} style={toggleBtn(byMember)}>{t.household.monthsByMember}</button>
          </div>
        )}
      </div>

      <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12.5, color: 'var(--aurora-faint)', margin: '0 0 12px', lineHeight: 1.5 }}>
        {rate === null
          ? t.household.monthsNoIncome
          : <>
              {t.household.monthsSavings.replace('{rate}', String(rate))}
              {delta !== null && (
                <span style={{ color: delta >= 0 ? 'var(--aurora-emerald)' : 'var(--aurora-rose)', fontWeight: 700 }}>
                  {' '}({delta >= 0 ? '+' : '−'}{Math.abs(delta)} {t.household.monthsPoints})
                </span>
              )}
            </>}
      </p>

      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
        {months.map(m => {
          const [y, mo] = [Number(m.month.slice(0, 4)), Number(m.month.slice(5, 7))]
          const selected = mo === month && y === year
          const incomeH = (m.income / max) * CHART_H
          const expenseH = (m.expense / max) * CHART_H
          return (
            <button
              key={m.month}
              type="button"
              onClick={() => onSelectMonth(mo, y)}
              title={`${t.months[mo - 1]} ${y}: +${formatAmount(m.income)} / −${formatAmount(m.expense)}`}
              aria-label={`${t.months[mo - 1]} ${y}`}
              aria-pressed={selected}
              style={{
                flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer',
                background: selected ? 'rgba(139,92,246,0.12)' : 'transparent', border: selected ? '1px solid rgba(139,92,246,0.4)' : '1px solid transparent',
                borderRadius: 12, padding: '6px 2px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: CHART_H }}>
                <div style={{ width: 12, height: Math.max(incomeH, m.income > 0 ? 2 : 0), background: 'var(--aurora-emerald)', borderRadius: 4 }} />
                {byMember && canSplit ? (
                  <div style={{ width: 12, height: Math.max(expenseH, m.expense > 0 ? 2 : 0), display: 'flex', flexDirection: 'column-reverse', borderRadius: 4, overflow: 'hidden' }}>
                    {memberIds.map((id, i) => {
                      const v = m.members?.find(x => x.userId === id)?.expense ?? 0
                      return <div key={id} style={{ height: m.expense > 0 ? `${(v / m.expense) * 100}%` : 0, background: MEMBER_COLORS[i % MEMBER_COLORS.length] }} />
                    })}
                  </div>
                ) : (
                  <div style={{ width: 12, height: Math.max(expenseH, m.expense > 0 ? 2 : 0), background: 'var(--aurora-rose)', borderRadius: 4 }} />
                )}
              </div>
              <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, fontWeight: selected ? 700 : 500, color: selected ? 'var(--aurora-violet)' : 'var(--aurora-faint)' }}>
                {t.monthsShort[mo - 1]}
              </span>
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10, fontFamily: "'Manrope', sans-serif", fontSize: 11.5, color: 'var(--aurora-faint)' }}>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--aurora-emerald)', marginRight: 5 }} />{t.dashboard.income}</span>
        {byMember && canSplit
          ? memberIds.map((id, i) => (
              <span key={id}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: MEMBER_COLORS[i % MEMBER_COLORS.length], marginRight: 5 }} />{memberName.get(id)}</span>
            ))
          : <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--aurora-rose)', marginRight: 5 }} />{t.dashboard.expenses}</span>}
      </div>
    </GlassCard>
  )
}
