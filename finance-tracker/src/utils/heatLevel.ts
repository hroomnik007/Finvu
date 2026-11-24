/**
 * Day intensity for the spending heatmap (Dashboard) and the payment calendar
 * (Fixné výdavky): small < 20, medium < 100, large ≥ 100 of the day's total.
 * One hue in three strengths (--heat-1..3 in index.css), so a darker day
 * always means more money.
 */
export type HeatLevel = 1 | 2 | 3

export const HEAT_LARGE_FROM = 100
const HEAT_MEDIUM_FROM = 20

export function heatLevel(amount: number): HeatLevel {
  if (amount >= HEAT_LARGE_FROM) return 3
  if (amount >= HEAT_MEDIUM_FROM) return 2
  return 1
}

export const heatBg = (level: HeatLevel): string => `var(--heat-${level})`

/** Day number on a filled cell: white on the strongest step, theme ink otherwise. */
export const heatInk = (level: HeatLevel): string => (level === 3 ? 'var(--heat-ink-strong)' : 'var(--heat-ink)')
