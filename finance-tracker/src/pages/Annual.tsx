import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { GlassCard } from '../components/GlassCard'
import { QueryError, Skeleton } from '../components/QueryState'
import { getMonthlySeries } from '../api/transactions'
import { annualCsv, annualRows, savingsRatePct, yearCategories, yearTotals } from '../utils/annual'
import { useFormatters } from '../hooks/useFormatters'
import { useTranslation } from '../i18n'

const th: React.CSSProperties = { fontFamily: "'Manrope', sans-serif", fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--aurora-faint)', padding: '6px 6px', textAlign: 'right' }
const td: React.CSSProperties = { fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-hi)', padding: '7px 6px', textAlign: 'right', whiteSpace: 'nowrap' }
// First column stays put while the table scrolls sideways on narrow screens.
const stickyCol: React.CSSProperties = { position: 'sticky', left: 0, zIndex: 1, background: 'var(--aurora-panel)', textAlign: 'left' }
const statLabel: React.CSSProperties = { fontFamily: "'Manrope', sans-serif", fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--aurora-faint)', marginBottom: 4 }
const sectionTitle: React.CSSProperties = { fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--aurora-hi)', margin: 0 }

function downloadCsv(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function AnnualPage({ scope }: { scope: 'personal' | 'family' }) {
  const { t, locale } = useTranslation()
  const { formatAmount } = useFormatters()
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['monthlySeries', `${year}-01`, `${year}-12`, scope, 'categories'],
    queryFn: () => getMonthlySeries(`${year}-01`, `${year}-12`, scope, 'categories'),
  })
  const months = data?.months ?? []
  const totals = yearTotals(months)
  const categories = yearCategories(months)
  const maxCat = Math.max(1, ...categories.map(c => c.total))
  const balance = totals.income - totals.expense
  const rate = savingsRatePct(totals.income, totals.expense)
  const rows = annualRows(year, months)
  const shortMonth = (i: number) => {
    const m = new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(year, i, 15)).replace(/\.$/, '')
    return m.charAt(0).toLocaleUpperCase(locale) + m.slice(1)
  }
  const signed = (v: number) => `${v >= 0 ? '+' : '\u2212'}${formatAmount(Math.abs(v))}`
  const dash = <><span aria-hidden="true">—</span><span className="sr-only">{formatAmount(0)}</span></>

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
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px var(--page-pad-bottom-nofab)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 20, fontWeight: 700, color: 'var(--aurora-hi)', margin: 0 }}>{t.annual.title}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" className="hit-44" aria-label={t.common.prevYear} title={t.common.prevYear} onClick={() => setYear(y => y - 1)} style={arrow}><ChevronLeft size={16} /></button>
            <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--aurora-hi)', minWidth: 44, textAlign: 'center' }}>{year}</span>
            <button type="button" className="hit-44" aria-label={t.common.nextYear} title={t.common.nextYear} onClick={() => setYear(y => y + 1)} disabled={year >= currentYear} style={{ ...arrow, opacity: year >= currentYear ? 0.4 : 1 }}><ChevronRight size={16} /></button>
          </div>
        </div>

        {isLoading ? (
          <div role="status" aria-busy="true" aria-label={t.common.loading} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <GlassCard radius={18} style={{ padding: '14px 16px', display: 'flex', gap: 16 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ flex: '1 1 120px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Skeleton width="50%" height={10} />
                  <Skeleton width="80%" height={18} />
                </div>
              ))}
            </GlassCard>
            <GlassCard radius={18} style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} height={14} />)}
            </GlassCard>
          </div>
        ) : isError ? (
          <QueryError onRetry={refetch} />
        ) : (
          <>
          <div className="annual-stats">
            {([
              [t.dashboard.income, `+${formatAmount(totals.income)}`, 'var(--aurora-emerald)'],
              [t.dashboard.expenses, `\u2212${formatAmount(totals.expense)}`, 'var(--aurora-rose)'],
              [t.annual.balance, signed(balance), balance >= 0 ? 'var(--aurora-emerald)' : 'var(--aurora-rose)'],
              ...(rate !== null ? [[t.dashboard.savingsRate, `${rate} %`, 'var(--aurora-hi)']] : []),
            ] as [string, string, string][]).map(([label, value, color]) => (
              <GlassCard key={label} radius={16} style={{ padding: '14px 16px' }}>
                <div style={statLabel}>{label}</div>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 20, fontWeight: 700, color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
              </GlassCard>
            ))}
          </div>

          <div className="annual-grid">
            <GlassCard radius={18} style={{ padding: '14px 14px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p id="annual-chart-title" style={sectionTitle}>{t.annual.chartTitle}</p>
              <div role="group" aria-labelledby="annual-chart-title" aria-description={t.annual.chartAria.replace('{year}', String(year))} style={{ display: 'flex', alignItems: 'stretch', gap: 2, flex: 1, minHeight: 190 }}>
                {rows.map(r => {
                  const name = t.months[r.index]
                  const label = r.empty
                    ? t.annual.barAriaEmpty.replace('{month}', name)
                    : t.annual.barAria.replace('{month}', name).replace('{income}', formatAmount(r.income)).replace('{expense}', formatAmount(r.expense))
                  return (
                    <div key={r.month} role="img" aria-label={label} title={label} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <div aria-hidden="true" style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 2, borderBottom: '1px solid var(--aurora-gline)' }}>
                        <div style={{ width: '38%', maxWidth: 14, height: `max(2px, ${r.incomePct}%)`, borderRadius: '3px 3px 0 0', background: 'var(--aurora-emerald)', opacity: r.income > 0 ? 1 : 0.35 }} />
                        <div style={{ width: '38%', maxWidth: 14, height: `max(2px, ${r.expensePct}%)`, borderRadius: '3px 3px 0 0', background: 'var(--aurora-rose)', opacity: r.expense > 0 ? 1 : 0.35 }} />
                      </div>
                      <span aria-hidden="true" style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, color: r.empty ? 'var(--aurora-faint)' : 'var(--aurora-lo)', opacity: r.empty ? 0.6 : 1, whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '100%' }}>{shortMonth(r.index)}</span>
                    </div>
                  )
                })}
              </div>
              <div aria-hidden="true" style={{ display: 'flex', gap: 16, fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-lo)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--aurora-emerald)' }} />{t.dashboard.income}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--aurora-rose)' }} />{t.dashboard.expenses}</span>
              </div>
            </GlassCard>

            <GlassCard radius={18} style={{ padding: '8px 10px', overflowX: 'auto', background: 'var(--aurora-panel)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
                <caption className="sr-only">{t.annual.title} {year}</caption>
                <thead>
                  <tr>
                    <th scope="col" style={{ ...th, ...stickyCol }}>{t.annual.month}</th>
                    <th scope="col" style={th}>{t.dashboard.income}</th>
                    <th scope="col" style={th}>{t.dashboard.expenses}</th>
                    <th scope="col" style={th}>{t.annual.balance}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const faint = r.empty ? { color: 'var(--aurora-faint)', opacity: 0.6 } : null
                    return (
                      <tr key={r.month} style={{ borderTop: '1px solid var(--aurora-gline)' }}>
                        <th scope="row" style={{ ...td, ...stickyCol, fontWeight: 500, ...faint }}>{t.months[r.index]}</th>
                        <td style={{ ...td, color: 'var(--aurora-emerald)', ...faint }}>{r.income > 0 ? formatAmount(r.income) : dash}</td>
                        <td style={{ ...td, color: 'var(--aurora-rose)', ...faint }}>{r.expense > 0 ? `\u2212${formatAmount(r.expense)}` : dash}</td>
                        <td style={{ ...td, fontWeight: 700, color: r.balance >= 0 ? 'var(--aurora-hi)' : 'var(--aurora-rose)', ...faint }}>{r.empty ? dash : signed(r.balance)}</td>
                      </tr>
                    )
                  })}
                  <tr style={{ borderTop: '2px solid var(--aurora-gline)' }}>
                    <th scope="row" style={{ ...td, ...stickyCol, fontWeight: 700 }}>{t.annual.total}</th>
                    <td style={{ ...td, fontWeight: 700, color: 'var(--aurora-emerald)' }}>{formatAmount(totals.income)}</td>
                    <td style={{ ...td, fontWeight: 700, color: 'var(--aurora-rose)' }}>{totals.expense > 0 ? `\u2212${formatAmount(totals.expense)}` : dash}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{signed(balance)}</td>
                  </tr>
                </tbody>
              </table>
            </GlassCard>
          </div>

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

          </>
        )}

        <button
          type="button"
          onClick={exportCsv}
          disabled={months.length === 0}
          style={{ opacity: months.length === 0 ? 0.45 : 1, alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 12, border: '1.5px solid var(--aurora-violet)', background: 'transparent', color: 'var(--aurora-violet-text)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: "'Outfit', sans-serif" }}
        >
          <Download size={15} /> {t.annual.export}
        </button>
      </div>
    </div>
  )
}
