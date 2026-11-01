// Parsing and formatting for typed money amounts.
//
// Users type amounts with either "." or "," as the decimal separator (and paste
// values like "1 234,56" or "1,234.56"). The input keeps a normalised string that
// always uses the active locale's decimal separator, and the value sent to the
// API comes from parseAmountInput, so "12.50" and "12,50" both mean 12.5.

const MAX_INT_DIGITS = 10 // backend: numeric(12, 2)
const MAX_DECIMALS = 2

// Digit grouping with an explicit grouping character, e.g. "1.234,56", "1,234.56",
// "1.234.567". Group character and decimal character must differ.
const GROUPED = /^(\d{1,3})((?:([.,])\d{3})+)(?:([.,])(\d*))?$/

export function decimalSeparator(locale: string): string {
  try {
    const part = new Intl.NumberFormat(locale).formatToParts(1.5).find(p => p.type === 'decimal')
    return part?.value === '.' ? '.' : ','
  } catch {
    return ','
  }
}

function split(raw: string): { int: string; frac: string | null } | null {
  // Spaces (incl. the no-break spaces Intl uses) are only ever thousands separators.
  const s = raw.replace(/[\s\u00a0\u202f]/g, '').replace(/[^0-9.,]/g, '')
  if (s === '') return { int: '', frac: null }

  const g = GROUPED.exec(s)
  if (g) {
    const groupSep = g[3]
    const decSep = g[4]
    const multipleGroups = g[2].length > 4
    // "1.234" alone is ambiguous, so it falls through to the decimal reading below.
    if ((decSep && decSep !== groupSep) || (!decSep && multipleGroups)) {
      return { int: g[1] + g[2].split(groupSep).join(''), frac: decSep ? (g[5] ?? '') : null }
    }
  }

  const seps = s.match(/[.,]/g) ?? []
  if (seps.length > 1) return null
  if (seps.length === 0) return { int: s, frac: null }
  const [int, frac] = s.split(/[.,]/)
  return { int, frac }
}

/**
 * Normalises what the user typed into the amount field. Returns the string to show
 * (with the locale's decimal separator) or null when the change should be ignored
 * (a second decimal separator, a third decimal digit, too many digits).
 */
export function normalizeAmountInput(raw: string, decSep = ','): string | null {
  const parts = split(raw)
  if (!parts) return null
  let { int } = parts
  const { frac } = parts
  if (frac !== null && frac.length > MAX_DECIMALS) return null
  int = int.replace(/^0+(?=\d)/, '')
  if (int.length > MAX_INT_DIGITS) return null
  if (frac === null) return int
  return (int || '0') + decSep + frac
}

/** Next value for an amount field: the normalised input, or the previous value if the change is rejected. */
export function nextAmountInput(raw: string, prev: string, decSep = ','): string {
  return normalizeAmountInput(raw, decSep) ?? prev
}

/** Parses a typed amount (either separator, optional thousands spaces). Null when empty or invalid. */
export function parseAmountInput(raw: string): number | null {
  const parts = split(raw ?? '')
  if (!parts) return null
  const { int, frac } = parts
  if (frac !== null && frac.length > MAX_DECIMALS) return null
  if (int === '' && !frac) return null
  const n = Number(`${int || '0'}.${frac || '0'}`)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

/**
 * Formats a stored amount for editing: locale decimal separator, no grouping, so
 * re-editing never mixes separators. Whole numbers stay whole ("100"), others get
 * two decimals ("12,50").
 */
export function formatAmountInput(value: number | string | null | undefined, decSep = ','): string {
  const n = typeof value === 'string' ? Number(value) : value
  if (n == null || !Number.isFinite(n)) return ''
  const rounded = Math.round(n * 100) / 100
  const s = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
  return s.replace('.', decSep)
}
