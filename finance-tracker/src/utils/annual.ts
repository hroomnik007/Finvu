import type { SeriesMonth } from '../api/transactions'

// Share of income kept; null without income.
export function savingsRatePct(income: number, expense: number): number | null {
  return income > 0 ? Math.round(((income - expense) / income) * 100) : null
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
