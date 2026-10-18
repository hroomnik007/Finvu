import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { GlassCard } from '../components/GlassCard'
import { getMonthlySeries } from '../api/transactions'
import { annualCsv, savingsRatePct, yearCategories, yearTotals } from '../utils/annual'
import { useFormatters } from '../hooks/useFormatters'
import { useTranslation } from '../i18n'

const th: React.CSSProperties = { fontFamily: "'Manrope', sans-serif", fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--aurora-faint)', padding: '6px 6px', textAlign: 'right' }
const td: React.CSSProperties = { fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-hi)', padding: '7px 6px', textAlign: 'right', whiteSpace: 'nowrap' }

function downloadCsv(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function AnnualPage({ scope }: { scope: 'personal' | 'family' }) {
  const { t } = useTranslation()
  const { formatAmount } = useFormatters()
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)

  const { data } = useQuery({
    queryKey: ['monthlySeries', `${year}-01`, `${year}-12`, scope, 'categories'],
    queryFn: () => getMonthlySeries(`${year}-01`, `${year}-12`, scope, 'categories'),
  })
  const months = data?.months ?? []
  const totals = yearTotals(months)
  const categories = yearCategories(months)
  const maxCat = Math.max(1, ...categories.map(c => c.total))
  const balance = totals.income - totals.expense
  const rate = savingsRatePct(totals.income, totals.expense)

  function exportCsv() {
    downloadCsv(
      annualCsv(year, months, {
        month: t.annual.month, income: t.dashboard.income, expense: t.dashboard.expenses, balance: t.annual.balance,
        category: t.annual.category, amount: t.annual.amount, total: t.annual.total, monthNames: t.months, noCategory: t.annual.noCategory,
      }),
      `finvu-rocny-prehlad-${year}.csv`,
    )
  }

  const arrow: React.CSSProperties = { background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 10, width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--aurora-hi)' }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px calc(120px + env(safe-area-inset-bottom, 0px))' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 20, fontWeight: 700, color: 'var(--aurora-hi)', margin: 0 }}>{t.annual.title}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" aria-label={String(year - 1)} onClick={() => setYear(y => y - 1)} style={arrow}><ChevronLeft size={16} /></button>
            <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--aurora-hi)', minWidth: 44, textAlign: 'center' }}>{year}</span>
            <button type="button" aria-label={String(year + 1)} onClick={() => setYear(y => y + 1)} disabled={year >= currentYear} style={{ ...arrow, opacity: year >= currentYear ? 0.4 : 1 }}><ChevronRight size={16} /></button>
          </div>
        </div>

        <GlassCard radius={18} style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {([
              [t.dashboard.income, `+${formatAmount(totals.income)}`, 'var(--aurora-emerald)'],
              [t.dashboard.expenses, `−${formatAmount(totals.expense)}`, 'var(--aurora-rose)'],
              [t.annual.balance, `${balance >= 0 ? '+' : '−'}${formatAmount(Math.abs(balance))}`, balance >= 0 ? 'var(--aurora-emerald)' : 'var(--aurora-rose)'],
              ...(rate !== null ? [[t.dashboard.savingsRate, `${rate} %`, 'var(--aurora-hi)']] : []),
            ] as [string, string, string][]).map(([label, value, color]) => (
              <div key={label} style={{ flex: '1 1 120px' }}>
                <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--aurora-faint)', marginBottom: 2 }}>{label}</div>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 17, fontWeight: 700, color }}>{value}</div>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard radius={18} style={{ padding: '8px 10px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 360 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>{t.annual.month}</th>
                <th style={th}>{t.dashboard.income}</th>
                <th style={th}>{t.dashboard.expenses}</th>
                <th style={th}>{t.annual.balance}</th>
              </tr>
            </thead>
            <tbody>
              {months.map(m => {
                const b = m.income - m.expense
                return (
                  <tr key={m.month} style={{ borderTop: '1px solid var(--aurora-gline)' }}>
                    <td style={{ ...td, textAlign: 'left' }}>{t.months[Number(m.month.slice(5, 7)) - 1]}</td>
                    <td style={{ ...td, color: 'var(--aurora-emerald)' }}>{formatAmount(m.income)}</td>
                    <td style={{ ...td, color: 'var(--aurora-rose)' }}>{formatAmount(m.expense)}</td>
                    <td style={{ ...td, fontWeight: 700, color: b >= 0 ? 'var(--aurora-hi)' : 'var(--aurora-rose)' }}>{b >= 0 ? '' : '−'}{formatAmount(Math.abs(b))}</td>
                  </tr>
                )
              })}
              <tr style={{ borderTop: '2px solid var(--aurora-gline)' }}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{t.annual.total}</td>
                <td style={{ ...td, fontWeight: 700, color: 'var(--aurora-emerald)' }}>{formatAmount(totals.income)}</td>
                <td style={{ ...td, fontWeight: 700, color: 'var(--aurora-rose)' }}>{formatAmount(totals.expense)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{balance >= 0 ? '' : '−'}{formatAmount(Math.abs(balance))}</td>
              </tr>
            </tbody>
          </table>
        </GlassCard>

        {categories.length > 0 && (
          <GlassCard radius={18} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--aurora-hi)', margin: 0 }}>{t.annual.categories}</p>
            {categories.map(c => (
              <div key={c.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-hi)' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || t.annual.noCategory}</span>
                  <span style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{formatAmount(c.total)}</span>
                </div>
                <div style={{ height: 6, borderRadius: 4, background: 'var(--aurora-glass)', marginTop: 4 }}>
                  <div style={{ height: 6, borderRadius: 4, width: `${(c.total / maxCat) * 100}%`, background: c.color ?? 'var(--aurora-violet)' }} />
                </div>
              </div>
            ))}
          </GlassCard>
        )}

        <button
          type="button"
          onClick={exportCsv}
          disabled={months.length === 0}
          style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 12, border: '1.5px solid var(--aurora-violet)', background: 'transparent', color: 'var(--aurora-violet)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: "'Outfit', sans-serif" }}
        >
          <Download size={15} /> {t.annual.export}
        </button>
      </div>
    </div>
  )
}
