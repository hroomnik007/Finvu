import { useSyncExternalStore } from 'react'
import { sk, type Translations } from './sk'
import { useSettingsContext } from '../context/SettingsContext'

export { sk }
export type { Translations }

const SUPPORTED_LANGS = ['sk', 'cs', 'pl', 'hu', 'en'] as const
export type SupportedLang = (typeof SUPPORTED_LANGS)[number]

// Only Slovak ships in the main bundle (it is the base text and the fallback);
// the other languages are separate chunks, loaded when they are first needed.
// main.tsx waits for the starting language before the first render.
const LOADERS: Record<Exclude<SupportedLang, 'sk'>, () => Promise<Translations>> = {
  cs: () => import('./cs').then(m => m.cs),
  pl: () => import('./pl').then(m => m.pl),
  hu: () => import('./hu').then(m => m.hu),
  en: () => import('./en').then(m => m.en),
}

const loaded: Partial<Record<SupportedLang, Translations>> = { sk }
const pending = new Map<SupportedLang, Promise<void>>()
const listeners = new Set<() => void>()
let version = 0

export function resolveLang(language: string | undefined | null): SupportedLang {
  return (SUPPORTED_LANGS as readonly string[]).includes(language ?? '') ? (language as SupportedLang) : 'en'
}

// Resolves once the language is available. A failed load (e.g. offline before
// the chunk was ever cached) is not fatal: Slovak is shown and the next call retries.
export function loadLanguage(language: string | undefined | null): Promise<void> {
  const lang = resolveLang(language)
  if (loaded[lang]) return Promise.resolve()
  let p = pending.get(lang)
  if (!p) {
    p = LOADERS[lang as Exclude<SupportedLang, 'sk'>]()
      .then(tr => {
        loaded[lang] = tr
        version++
        listeners.forEach(l => l())
      })
      .catch(() => {})
      .finally(() => pending.delete(lang))
    pending.set(lang, p)
  }
  return p
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

const LOCALE_MAP: Record<SupportedLang, string> = {
  sk: 'sk-SK', cs: 'cs-CZ', pl: 'pl-PL', hu: 'hu-HU', en: 'en-GB',
}

export function useTranslation() {
  const { settings } = useSettingsContext()
  const lang = resolveLang(settings.language)
  useSyncExternalStore(subscribe, () => version)
  const tr = loaded[lang]
  // A language picked later loads from the precache in a moment; Slovak until then.
  if (!tr) void loadLanguage(lang)
  // shownLang is the language of the strings actually rendered (Slovak while a
  // chunk is still loading), so <html lang> never disagrees with the text.
  return { t: tr ?? sk, lang, shownLang: tr ? lang : ('sk' as SupportedLang), locale: LOCALE_MAP[lang] }
}

// ── Localized date names (replaces hardcoded Slovak day/month arrays) ──────
// Index 0 = Sunday to match Date.getDay(); noon UTC guards against TZ shifts.
const dayNamesCache = new Map<string, string[]>()
const monthNamesCache = new Map<string, string[]>()

export function getLocalizedDayNames(locale: string): string[] {
  let names = dayNamesCache.get(locale)
  if (!names) {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' })
    names = Array.from({ length: 7 }, (_, i) => {
      // 2023-01-01 was a Sunday
      const name = fmt.format(new Date(Date.UTC(2023, 0, 1 + i, 12)))
      return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1)
    })
    dayNamesCache.set(locale, names)
  }
  return names
}

export function getLocalizedMonthNames(locale: string): string[] {
  let names = monthNamesCache.get(locale)
  if (!names) {
    const fmt = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' })
    names = Array.from({ length: 12 }, (_, i) => fmt.format(new Date(Date.UTC(2023, i, 1, 12))))
    monthNamesCache.set(locale, names)
  }
  return names
}
