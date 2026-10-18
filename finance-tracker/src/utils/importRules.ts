export interface ImportRule {
  id: string
  keyword: string
  categoryId: string
}

// Same normalisation as the backend: no case, diacritics or extra whitespace.
export function normalizeKeyword(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// The rule whose keyword occurs in the description; the longest keyword wins so
// "lidl bratislava" beats "lidl".
export function matchRule(description: string, rules: ImportRule[]): ImportRule | undefined {
  const text = normalizeKeyword(description)
  if (!text) return undefined
  let best: ImportRule | undefined
  for (const r of rules) {
    if (text.includes(r.keyword) && (!best || r.keyword.length > best.keyword.length)) best = r
  }
  return best
}

// Words banks put in front of the merchant; they say nothing about the category.
const GENERIC = new Set([
  'platba', 'platby', 'kartou', 'karta', 'karty', 'nakup', 'prevod', 'trvaly', 'prikaz', 'inkaso',
  'payment', 'card', 'purchase', 'transfer', 'pos', 'vyber', 'bankomat', 'atm', 'sepa', 'tpp',
])

// First meaningful word of a statement description, e.g.
// "Platba kartou LIDL BRATISLAVA 123" -> "lidl".
export function suggestKeyword(description: string): string {
  const words = normalizeKeyword(description)
    .replace(/[^a-z\s]/g, ' ')
    .split(' ')
    .filter(w => w.length >= 3 && !GENERIC.has(w))
  return words[0] ?? ''
}
