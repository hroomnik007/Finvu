import { toLocalISO } from './format'

/**
 * The day a user started tracking (YYYY-MM-DD): tracking_start_date, or — when it
 * was never set — the day the account was created. Months before its month are
 * empty everywhere (the backend applies the same rule, lib/trackingStart.ts).
 */
export function trackingStartOf(user: { tracking_start_date?: string | null; createdAt?: string | null } | null | undefined): string | null {
  if (!user) return null
  if (user.tracking_start_date) return user.tracking_start_date
  if (user.createdAt) {
    const d = new Date(user.createdAt)
    if (!Number.isNaN(d.getTime())) return toLocalISO(d)
  }
  return null
}
