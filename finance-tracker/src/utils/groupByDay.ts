/**
 * Groups items by their ISO date (YYYY-MM-DD prefix), keeping the input order of
 * first appearance for groups and items. `signed` returns the signed amount used
 * for the day total (e.g. +income / −expense), so mixed lists such as search
 * results get a net total.
 */
export interface DayGroup<T> { date: string; items: T[]; total: number }

export function groupByDay<T>(items: readonly T[], getDate: (item: T) => string, signed: (item: T) => number): DayGroup<T>[] {
  const map = new Map<string, DayGroup<T>>()
  for (const item of items) {
    const date = (getDate(item) ?? '').slice(0, 10)
    let g = map.get(date)
    if (!g) { g = { date, items: [], total: 0 }; map.set(date, g) }
    g.items.push(item)
    // Sum in cents to avoid float drift (0.1 + 0.2).
    g.total = Math.round(g.total * 100 + signed(item) * 100) / 100
  }
  return [...map.values()]
}

/** "+12,30 €" / "−5,00 €" using U+2212 for negatives (display only). */
export function signedAmount(total: number, format: (n: number) => string): string {
  if (total < 0) return `\u2212${format(-total)}`
  return `+${format(total)}`
}
