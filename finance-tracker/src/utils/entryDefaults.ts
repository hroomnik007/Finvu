// Defaults that make adding a transaction take fewer taps.

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/**
 * Default date for a new entry while viewing `month`/`year` (1-based month):
 * - the running month → today,
 * - a past month → its last day (the most likely "I forgot to log it" date),
 * - a future month → the same day of month as today, clamped to that month's length.
 */
export function defaultEntryDate(month: number, year: number, today: Date = new Date()): string {
  const ty = today.getFullYear(), tm = today.getMonth() + 1, td = today.getDate()
  const daysInMonth = new Date(year, month, 0).getDate()
  if (year === ty && month === tm) return iso(ty, tm, td)
  const isPast = year < ty || (year === ty && month < tm)
  return iso(year, month, isPast ? daysInMonth : Math.min(td, daysInMonth))
}

/** Categories ordered by how often they were used (most first), ties and unused A–Z. */
export function sortCategoriesByUsage<C extends { id?: string; name: string }>(
  categories: readonly C[],
  usedCategoryIds: Iterable<string | null | undefined>,
  locale?: string,
): C[] {
  const counts = new Map<string, number>()
  for (const id of usedCategoryIds) if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
  return [...categories].sort((a, b) =>
    (counts.get(b.id ?? '') ?? 0) - (counts.get(a.id ?? '') ?? 0)
    || a.name.localeCompare(b.name, locale, { sensitivity: 'base' }))
}

/** The `n` months ending with `month`/`year`, newest first, as [month, year] pairs. */
export function recentMonths(month: number, year: number, n: number): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (let i = 0; i < n; i++) {
    const d = new Date(year, month - 1 - i, 1)
    out.push([d.getMonth() + 1, d.getFullYear()])
  }
  return out
}
