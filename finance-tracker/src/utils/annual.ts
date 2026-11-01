import type { SeriesMonth } from '../api/transactions'

// Share of income kept; null without income.
export function savingsRatePct(income: number, expense: number): number | null {
  return income > 0 ? Math.round(((income - expense) / income) * 100) : null
}

// The series projects recurring rows into every following month; a month that has not
// started yet must not count, so drop everything after `currentMonth` (YYYY-MM).
export function monthsUpTo(months: SeriesMonth[], currentMonth: string): SeriesMonth[] {
  return months.filter(m => m.month <= currentMonth)
}

// Whole-year totals over the months of a series.
export function yearTotals(months: SeriesMonth[]): { income: number; expense: number } {
  return months.reduce((t, m) => ({ income: t.income + m.income, expense: t.expense + m.expense }), { income: 0, expense: 0 })
}

// Expense categories of the whole year, same-named ones merged, biggest first.
export function yearCategories(months: SeriesMonth[]): { name: string; color: string | null; total: number }[] {
  const by = new Map<string, { name: string; color: string | null; total: number }>()
  for (const m of months) {
    for (const c of m.categories ?? []) {
      if (c.type !== 'expense') continue
      const key = c.name.trim().toLowerCase()
      const cur = by.get(key) ?? { name: c.name, color: c.color, total: 0 }
      cur.total += c.total
      by.set(key, cur)
    }
  }
  return [...by.values()].sort((a, b) => b.total - a.total)
}

// A spreadsheet reads a cell starting with = + - @ as a formula
function safeCell(value: string): string {
  const v = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return `"${v.replace(/"/g, '""')}"`
}

export function annualCsv(
  year: number,
  months: SeriesMonth[],
  labels: { month: string; income: string; expense: string; balance: string; category: string; amount: string; total: string; monthNames: string[]; noCategory: string },
): string {
  const lines = [[labels.month, labels.income, labels.expense, labels.balance].join(',')]
  for (const m of months) {
    const idx = Number(m.month.slice(5, 7)) - 1
    lines.push([safeCell(`${labels.monthNames[idx]} ${year}`), m.income.toFixed(2), m.expense.toFixed(2), (m.income - m.expense).toFixed(2)].join(','))
  }
  const t = yearTotals(months)
  lines.push([safeCell(labels.total), t.income.toFixed(2), t.expense.toFixed(2), (t.income - t.expense).toFixed(2)].join(','))
  lines.push('')
  lines.push([labels.category, labels.amount].join(','))
  for (const c of yearCategories(months)) lines.push([safeCell(c.name || labels.noCategory), c.total.toFixed(2)].join(','))
  return lines.join('\n')
}

export interface AnnualRow {
  /** YYYY-MM */
  month: string
  /** 0-based month index */
  index: number
  income: number
  expense: number
  balance: number
  /** No income and no expense in this month. */
  empty: boolean
  /** Bar heights as a share (0–100) of the year's largest monthly value. */
  incomePct: number
  expensePct: number
}

// Twelve rows for the chart and table, filling months the series does not return.
export function annualRows(year: number, months: SeriesMonth[]): AnnualRow[] {
  const by = new Map(months.map(m => [m.month, m]))
  const raw = Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`
    const m = by.get(key)
    return { month: key, index: i, income: m?.income ?? 0, expense: m?.expense ?? 0 }
  })
  const max = Math.max(0, ...raw.map(r => Math.max(r.income, r.expense)))
  const pct = (v: number) => (max > 0 ? Math.round((v / max) * 1000) / 10 : 0)
  return raw.map(r => ({
    ...r,
    balance: Math.round((r.income - r.expense) * 100) / 100,
    empty: r.income === 0 && r.expense === 0,
    incomePct: pct(r.income),
    expensePct: pct(r.expense),
  }))
}
