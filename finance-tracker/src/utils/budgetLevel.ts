import type { Category } from '../types'

/**
 * One rule for every budget bar, percentage and card tint in the app:
 * - `over`    — at or past the limit (red)
 * - `near`    — from NEAR_LIMIT_PCT up to the limit (amber)
 * - `planned` — the limit is made only of the category's fixed payments and
 *               exactly that much was spent: paid as planned, nothing to warn about
 * - `ok`      — everything else
 */
export type BudgetLevel = 'ok' | 'near' | 'over' | 'planned'

export const NEAR_LIMIT_PCT = 85

const cents = (n: number) => Math.round(n * 100)

/**
 * The category's limit is exactly its fixed payments (auto limit without a
 * reserve). Shared categories carry the household's fixed total and reserve.
 */
export function limitIsFixedOnly(cat: Pick<Category, 'autoLimit' | 'limitReserve' | 'shared' | 'sharedFixedTotal' | 'sharedReserve'> | undefined): boolean {
  if (!cat) return false
  if (cat.shared && cat.sharedFixedTotal != null) return cat.sharedFixedTotal > 0 && !cat.sharedReserve
  return !!cat.autoLimit && !cat.limitReserve
}

export function budgetLevel(spent: number, limit: number, fixedOnly = false): BudgetLevel {
  if (!(limit > 0)) return 'ok'
  if (fixedOnly && cents(spent) === cents(limit)) return 'planned'
  if (cents(spent) >= cents(limit)) return 'over'
  if ((spent / limit) * 100 >= NEAR_LIMIT_PCT) return 'near'
  return 'ok'
}

export const BUDGET_LEVEL_COLOR: Record<BudgetLevel, string> = {
  ok: 'var(--aurora-emerald)',
  near: 'var(--aurora-amber)',
  over: 'var(--aurora-over)',
  planned: 'var(--aurora-lo)',
}

/** Card tint for the worst level in a set (planned and ok leave the card neutral). */
export function budgetSeverity(levels: BudgetLevel[]): 'red' | 'warning' | null {
  if (levels.includes('over')) return 'red'
  if (levels.includes('near')) return 'warning'
  return null
}

const RANK: Record<BudgetLevel, number> = { over: 0, near: 1, ok: 2, planned: 3 }

/** Sort key: over first, then near, then the rest; within a level the fullest first. */
export function compareBudget<T extends { spent: number; limit: number; percentage: number }>(
  levelOf: (b: T) => BudgetLevel,
): (a: T, b: T) => number {
  return (a, b) => RANK[levelOf(a)] - RANK[levelOf(b)] || b.percentage - a.percentage || b.spent - a.spent
}
