import { normalizeKeyword } from './importRules'

// Client side of GET /api/transactions/suggest-category. While the user types
// a description, a suggestion is asked for after a short pause and picks the
// category — but only while nobody chose one by hand. Once the user taps a
// category (or the form opened with one), suggestions stop for that form.

export const SUGGEST_DEBOUNCE_MS = 350
export const SUGGEST_MIN_LENGTH = 2

export interface SuggestionState {
  /** The user tapped a category in this form. */
  manual: boolean
  /** Category selected right now ('' = none). */
  currentId: string
  /** The category the last suggestion selected, if any. */
  suggestedId: string | null
  /** Category the form preselects on open; replacing it is fine until the user taps. */
  defaultId?: string
}

/** A suggestion may only fill an empty choice or replace an earlier suggestion. */
export function mayAutoSelect(s: SuggestionState): boolean {
  if (s.manual) return false
  return s.currentId === '' || s.currentId === s.suggestedId || (!!s.defaultId && s.currentId === s.defaultId)
}

export function suggestionQuery(text: string): string | null {
  const q = text.trim()
  return normalizeKeyword(q).length >= SUGGEST_MIN_LENGTH ? q : null
}

type Fetcher = (q: string, signal: AbortSignal) => Promise<{ categoryId: string } | null>

/**
 * Debounces lookups and drops stale answers: only the answer for the latest
 * text is delivered, and only if it is still allowed to select.
 */
export function createSuggestionScheduler(opts: {
  fetch: Fetcher
  onSuggest: (categoryId: string) => void
  canApply: (categoryId: string) => boolean
  delayMs?: number
}) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let ctrl: AbortController | null = null
  const cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
    ctrl?.abort()
    ctrl = null
  }
  const update = (text: string) => {
    cancel()
    const q = suggestionQuery(text)
    if (!q) return
    const mine = new AbortController()
    ctrl = mine
    timer = setTimeout(() => {
      timer = null
      opts.fetch(q, mine.signal).then(
        (s) => { if (!mine.signal.aborted && s && opts.canApply(s.categoryId)) opts.onSuggest(s.categoryId) },
        () => { /* a suggestion is optional — ignore failures */ },
      )
    }, opts.delayMs ?? SUGGEST_DEBOUNCE_MS)
  }
  return { update, cancel }
}
