// Shared Intl-based formatting. Every amount and date shown in the UI should go
// through these (directly or via the useFormatters hook) so the active language
// and the user's currency are applied consistently.

const DEFAULT_LOCALE = 'sk-SK'
const DEFAULT_CURRENCY = 'EUR'

function moneyFormatter(locale: string, currency: string): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 })
  } catch {
    return new Intl.NumberFormat(DEFAULT_LOCALE, { style: 'currency', currency: DEFAULT_CURRENCY, minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
}

// Rounds to cents and drops negative zero so -0.001 never renders as "-0,00 €".
function normalizeAmount(amount: number): number {
  const rounded = Math.round((Number.isFinite(amount) ? amount : 0) * 100) / 100
  return Object.is(rounded, -0) ? 0 : rounded
}

export function formatMoney(amount: number, locale: string = DEFAULT_LOCALE, currency: string = DEFAULT_CURRENCY): string {
  return moneyFormatter(locale, currency).format(normalizeAmount(amount))
}

/**
 * Splits a formatted amount into the large "main" part (sign, currency prefix,
 * integer digits) and the small "rest" (decimal separator, cents, currency suffix),
 * for hero numbers. E.g. sk-SK: "1 234" + ",56 €"; en-GB: "€1,234" + ".56".
 */
export function formatMoneyParts(amount: number, locale: string = DEFAULT_LOCALE, currency: string = DEFAULT_CURRENCY): { main: string; rest: string } {
  const parts = moneyFormatter(locale, currency).formatToParts(normalizeAmount(amount))
  const split = parts.findIndex(p => p.type === 'decimal')
  if (split === -1) return { main: parts.map(p => p.value).join(''), rest: '' }
  return {
    main: parts.slice(0, split).map(p => p.value).join('').trim(),
    rest: parts.slice(split).map(p => p.value).join(''),
  }
}

export function formatNumber(value: number, locale: string = DEFAULT_LOCALE, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, options).format(value)
}

function toDate(value: string | Date): Date {
  if (value instanceof Date) return value
  // Plain YYYY-MM-DD is a calendar date: parse it as local midnight, not UTC.
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + 'T00:00:00') : new Date(value)
}

export function formatDateLocale(
  value: string | Date,
  locale: string = DEFAULT_LOCALE,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' },
): string {
  const d = toDate(value)
  if (Number.isNaN(d.getTime())) return typeof value === 'string' ? value : ''
  return new Intl.DateTimeFormat(locale, options).format(d)
}

/** @deprecated use formatMoney with the active locale and currency. */
export function formatCurrency(amount: number, locale: string = DEFAULT_LOCALE, currency: string = DEFAULT_CURRENCY): string {
  return formatMoney(amount, locale, currency)
}

export function formatDate(dateStr: string, locale: string = DEFAULT_LOCALE): string {
  return formatDateLocale(dateStr, locale, { day: 'numeric', month: 'short' })
}

// YYYY-MM-DD of a moment in the user's LOCAL time zone. toISOString() is UTC, which
// gives the previous day for the first hour or two after local midnight.
export function toLocalISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayISO(): string {
  return toLocalISO(new Date())
}
