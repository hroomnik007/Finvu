// Plural forms via Intl.PluralRules, so every language gets its own rules
// (sk/cs: 1 / 2–4 / 5+, pl: 1 / 2–4 except 12–14 / 5+, hu/en: 1 / other).
// Three forms cover all five UI languages: `few` is only used where the locale
// has a "few" category and `many` covers both "many" and "other".
export interface PluralForms { one: string; few: string; many: string }

const rulesCache = new Map<string, Intl.PluralRules>()
function rules(locale: string): Intl.PluralRules {
  let r = rulesCache.get(locale)
  if (!r) { r = new Intl.PluralRules(locale); rulesCache.set(locale, r) }
  return r
}

export function pluralForm(n: number, forms: PluralForms, locale: string): string {
  const cat = rules(locale).select(n)
  return cat === 'one' ? forms.one : cat === 'few' ? forms.few : forms.many
}

/** "3 transakcie" – the count formatted for the locale plus the right word. */
export function pluralCount(n: number, forms: PluralForms, locale: string): string {
  return `${new Intl.NumberFormat(locale).format(n)} ${pluralForm(n, forms, locale)}`
}

/** Picks the plural form of a template like "o {n} dni" and fills in the count. */
export function pluralText(n: number, forms: PluralForms, locale: string): string {
  return pluralForm(n, forms, locale).replace('{n}', new Intl.NumberFormat(locale).format(n))
}
