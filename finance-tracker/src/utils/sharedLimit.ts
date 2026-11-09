import type { Category } from '../types'

// A shared category in which some household member has active fixed expenses:
// its limit is the household's fixed total plus one common reserve, so only the
// reserve is editable. Null for every other category (manual or own auto limit).
export function sharedFixedLimit(cat: Pick<Category, 'shared' | 'sharedFixedTotal' | 'sharedReserve'> | null | undefined): { fixedTotal: number; reserve: number } | null {
  if (!cat?.shared) return null
  const fixedTotal = cat.sharedFixedTotal ?? 0
  if (!(fixedTotal > 0)) return null
  return { fixedTotal, reserve: Math.max(0, cat.sharedReserve ?? 0) }
}

// The limit the household gets for a given reserve (rounded to cents like the backend).
export function sharedLimitFor(fixedTotal: number, reserve: number): number {
  return Math.round((fixedTotal + Math.max(0, reserve)) * 100) / 100
}
